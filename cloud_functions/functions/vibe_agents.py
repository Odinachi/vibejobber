from pathlib import Path

from agents import Agent

from config import DEFAULT_AGENT_MODEL
from tools import build_agent_tools
from store import JobStore


def build_agents(store: JobStore, output_dir: Path) -> dict[str, Agent]:
    t = build_agent_tools(store, output_dir)

    job_hunter_agent = Agent(
        name="Job Hunter",
        instructions=(
            "You find roles on ATS boards (Lever, Greenhouse, Ashby, Dover, Workable). "
            "Call search_job_boards with a focused job_title and optional extra_keywords. "
            "Jobs are stored in an internal list automatically. Summarize stored_jobs with markdown links."
        ),
        tools=[t["search_job_boards"]],
        model=DEFAULT_AGENT_MODEL,
    )

    job_page_fetch_agent = Agent(
        name="Job Page Fetcher",
        instructions=(
            "You load one job posting into memory for downstream steps. "
            "The user message includes job_index (integer). Call fetch_job_page exactly once with that index. "
            "Then briefly confirm you fetched the page and mention if the preview looks like a real job description."
        ),
        tools=[t["fetch_job_page"]],
        model=DEFAULT_AGENT_MODEL,
    )

    cover_letter_agent = Agent(
        name="Cover Letter Writer",
        instructions=(
            "You write a tailored cover letter. The user message includes: job_index, candidate_profile, "
            "and an excerpt of the job page. Decide file_format: use 'pdf' if the page mentions PDF upload "
            "or 'submit as PDF'; otherwise use 'txt'. Write the full letter, then call save_cover_letter "
            "with job_index, the full letter text, and file_format."
        ),
        tools=[t["save_cover_letter"]],
        model=DEFAULT_AGENT_MODEL,
    )

    cv_agent = Agent(
        name="CV Writer",
        instructions=(
            "You produce a concise CV tailored to the job requirements. The user message includes job_index, "
            "candidate_profile, and job excerpt. Highlight matching skills and experience. "
            "Use the same file_format rule as cover letters (pdf vs txt from posting language). "
            "Call save_cv_for_job with job_index, full cv_body, and file_format."
        ),
        tools=[t["save_cv_for_job"]],
        model=DEFAULT_AGENT_MODEL,
    )

    form_filler_agent = Agent(
        name="Form Fill Planner",
        instructions=(
            "You plan ATS application form answers (do not claim you submitted anything). "
            "From the job excerpt + candidate_profile, build a JSON object with keys 'fields' (list of "
            "{'name','value'}) and optional 'notes'. Typical fields: name, email, phone, LinkedIn, "
            "years of experience, work authorization, cover letter path. "
            "Call save_form_fill_plan with job_index and plan_json as a compact JSON string."
        ),
        tools=[t["save_form_fill_plan"]],
        model=DEFAULT_AGENT_MODEL,
    )

    return {
        "job_hunter": job_hunter_agent,
        "job_page_fetch": job_page_fetch_agent,
        "cover_letter": cover_letter_agent,
        "cv": cv_agent,
        "form_filler": form_filler_agent,
    }
