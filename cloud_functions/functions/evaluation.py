"""
LLM-as-judge evaluation for Vibejobber agents.

Uses a *different* default model from `DEFAULT_AGENT_MODEL` (see `VIBJOBBER_EVALUATOR_MODEL`)
so the benchmark is not scored by the same model that generated the draft.

Includes a small static benchmark (realistic job excerpt + candidate) for ad-hoc or CI-adjacent checks;
call `evaluate_agent_output` on any `Runner.run(...).final_output` string.
"""

from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path
from typing import Literal

from agents import Agent, Runner
from pydantic import BaseModel, Field

from config import DEFAULT_AGENT_MODEL

AgentRole = Literal["cover_letter", "cv", "form_filler", "job_hunter", "job_page_fetch", "custom"]

DEFAULT_EVALUATOR_MODEL = os.getenv("VIBJOBBER_EVALUATOR_MODEL", "gpt-4o")
EVALUATOR_TIMEOUT_SEC = float(os.getenv("VIBJOBBER_EVALUATOR_TIMEOUT_SEC", "120"))


class RealisticBenchmarkCase(BaseModel):
    """
    A fixed scenario: realistic posting snippet + profile you can use to exercise agents
    and then score with `evaluate_agent_output`.
    """

    id: str
    short_name: str
    agent_role: AgentRole
    job_excerpt: str
    candidate_profile: str
    notes: str = (
        "Senior backend role with explicit requirements; use to check tailoring vs generic text."
    )


# Realistic public-style posting text (fictional company) + plausible candidate — not production data.
SENIOR_BACKEND_BENCHMARK = RealisticBenchmarkCase(
    id="bench_senior_backend_001",
    short_name="Northwind — Senior Backend Engineer (Python)",
    agent_role="cover_letter",
    job_excerpt="""NORTHWIND ANALYTICS — Senior Backend Engineer (Python), Remote (US)

We're building reliable data pipelines and APIs for financial reporting. You will own services
from design through production: REST and async workers, PostgreSQL, Redis, and message queues.
Must-haves: 5+ years Python, solid SQL, experience with high-throughput services, and tests.
Nice-to-have: Pydantic, experience with regulated environments, OpenAPI, Docker/Kubernetes.
We review applications as PDF; submit your cover letter and resume as PDF.
No visa sponsorship for this position.""",
    candidate_profile="""Name: Jordan Lee
Location: Austin, TX (US citizen)
6 years Python; FastAPI, Celery, PostgreSQL, pytest; two years leading API migrations.
Prior: payments-adjacent startup (PCI awareness), on-call for production services.
Wants: backend-heavy role with clear ownership and strong engineering culture.""",
)


def _judge_model_name(explicit: str | None) -> str:
    m = (explicit or DEFAULT_EVALUATOR_MODEL or "").strip()
    if not m:
        m = "gpt-4o"
    # nudge: same model as agent is allowed but weakens the benchmark; we don't hard-fail.
    return m


JUDGE_INSTRUCTIONS = """You are an expert hiring-manager and staff engineer evaluating drafts from an automated job-application assistant.
Score strictly against the **task** and the **role-specific rubric**. Penalize generic text, invented facts, unsafe claims, and ignoring explicit posting constraints (e.g. PDF, location, years of experience).
Output must follow the required structured schema."""


def _rubric_for_role(role: AgentRole) -> str:
    common = "Penalize hallucinated employers, degrees, or tools not supported by the profile."
    rubrics: dict[AgentRole, str] = {
        "cover_letter": (
            "Does it address this specific role? Clear fit to stated must-haves? "
            "Professional tone, concrete evidence from profile, correct handling of file/PDF language if present? "
            + common
        ),
        "cv": (
            "Structure and scanability, honest alignment to job keywords, no invented roles or dates. "
            "Strong bullets with outcomes. " + common
        ),
        "form_filler": (
            "JSON plan should be plausible, complete for typical ATS fields, values consistent with profile, "
            "and no false submission claims. " + common
        ),
        "job_hunter": (
            "Search summary should be on-topic, mention concrete roles or companies when present, and avoid empty hype. "
            "Markdown or links to real postings when tools returned them. "
        ),
        "job_page_fetch": (
            "Confirms a job was loaded; signals whether the preview plausibly looks like a real job (not a generic error page)."
        ),
        "custom": "Apply general hiring-quality standards: relevance, honesty, and clarity. " + common,
    }
    return rubrics.get(role, rubrics["custom"])


def _user_message(
    role: AgentRole,
    task_user_message: str,
    agent_output: str,
) -> str:
    rubric = _rubric_for_role(role)
    return f"""**Agent role (pipeline step):** {role}

**Role-specific rubric:**
{rubric}

**Base model under test (for your awareness, not for scoring):** {DEFAULT_AGENT_MODEL}

---

**Task / prompt the agent received:**
<task>
{task_user_message.strip()}
</task>

---

**Agent final output to evaluate:**
<output>
{agent_output.strip()}
</output>
"""


class AgentEvaluationScores(BaseModel):
    task_alignment: int = Field(ge=1, le=5, description="Matches task and job-specific needs.")
    factuality: int = Field(
        ge=1,
        le=5,
        description="No unsupported claims; faithful to the given profile and quote.",
    )
    clarity_and_tone: int = Field(ge=1, le=5, description="Clear, professional, appropriate length.")
    overall: int = Field(ge=1, le=5, description="Single summary score.")


class AgentEvaluationResult(BaseModel):
    scores: AgentEvaluationScores
    strengths: str = Field(max_length=1200)
    weaknesses: str = Field(max_length=1200)
    benchmark_ready: bool = Field(
        description="True if this would be acceptable in a real application without edits.",
    )


class AgentEvaluatorReport(BaseModel):
    """Top-level return value including metadata for logging."""

    result: AgentEvaluationResult
    evaluator_model: str
    agent_model_reference: str


async def evaluate_agent_output(
    *,
    agent_role: AgentRole,
    task_user_message: str,
    agent_final_output: str,
    evaluator_model: str | None = None,
) -> AgentEvaluatorReport:
    """
    Run a separate (typically stronger) model to score one agent's final string output.

    Uses `SENIOR_BACKEND_BENCHMARK` (or a similar case) to build the *task* when you are
    replicating a full benchmark: pass the same `task_user_message` you feed to `Runner.run`.
    """
    em = _judge_model_name(evaluator_model)
    agent = Agent(
        name="Agent quality judge",
        instructions=JUDGE_INSTRUCTIONS,
        model=em,
        output_type=AgentEvaluationResult,
    )
    user_msg = _user_message(agent_role, task_user_message, agent_final_output)
    out = await asyncio.wait_for(
        Runner.run(agent, user_msg),
        timeout=EVALUATOR_TIMEOUT_SEC,
    )
    parsed = out.final_output
    if not isinstance(parsed, AgentEvaluationResult):
        raise TypeError(f"Expected AgentEvaluationResult from judge, got {type(parsed)}")
    return AgentEvaluatorReport(
        result=parsed,
        evaluator_model=em,
        agent_model_reference=DEFAULT_AGENT_MODEL,
    )


def format_benchmark_user_message(
    case: RealisticBenchmarkCase,
    *,
    job_index: int = 0,
) -> str:
    """Convenience: same shape as `pipeline` uses for cover/cv/form agents."""
    return (
        f"job_index={job_index}\n\ncandidate_profile:\n{case.candidate_profile}\n\n"
        f"job_page_excerpt:\n{case.job_excerpt}\n"
    )


# Default text when you run `python evaluation.py` with no --draft-file (judge only).
_JUDGE_ONLY_SAMPLE_COVER = """Dear Northwind Team,

I am writing to apply for the Senior Backend Engineer (Python) role. With six years in Python
(FastAPI, Celery) and strong PostgreSQL and production experience, I meet your five-year
Python and testing expectations. I can submit a PDF cover letter and resume as required.

I am a U.S. citizen based in Austin, TX, and I am not seeking visa sponsorship.

Best regards,
Jordan Lee"""


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "Run the evaluator LLM (judge) only: scores a draft against the static benchmark. "
            "No JobStore, no application agents, no deploy."
        ),
    )
    p.add_argument(
        "--role",
        choices=[
            "cover_letter",
            "cv",
            "form_filler",
            "job_hunter",
            "job_page_fetch",
            "custom",
        ],
        default="cover_letter",
        help="Rubric for the judge (default: cover_letter).",
    )
    p.add_argument(
        "--draft-file",
        type=Path,
        default=None,
        help="Path to a file with the text to score; if omitted, a short built-in sample is used.",
    )
    return p


async def _run_cli() -> None:
    from typing import cast

    from dotenv import load_dotenv

    # So `python evaluation.py` finds `../.env` (cloud_functions/.env) even if cwd is not that folder.
    _env = Path(__file__).resolve().parent.parent / ".env"
    if _env.is_file():
        load_dotenv(_env, override=True)

    args = _build_arg_parser().parse_args()
    task = format_benchmark_user_message(SENIOR_BACKEND_BENCHMARK, job_index=0)
    if args.draft_file is not None:
        draft = args.draft_file.read_text(encoding="utf-8")
    else:
        draft = _JUDGE_ONLY_SAMPLE_COVER
    report = await evaluate_agent_output(
        agent_role=cast(AgentRole, args.role),
        task_user_message=task,
        agent_final_output=draft,
    )
    print(report.model_dump_json(indent=2))


if __name__ == "__main__":
    asyncio.run(_run_cli())
