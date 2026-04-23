"""
Server-side CV and cover letter generation using openai-agents (no client mock).
Two-pass CV: draft from source CV + job, then ATS polish. Single pass for cover letter.
"""

from __future__ import annotations

import asyncio
import import_paths
import json
import os
import re
from typing import Any

import_paths.setup()

from agents import Agent, Runner  # noqa: E402

from config import DEFAULT_AGENT_MODEL  # noqa: E402
from cv_source_loader import load_source_cv_text  # noqa: E402
from usage_helpers import results_to_merged_dict  # noqa: E402


def _job_context_block(job: dict[str, Any]) -> str:
    reqs = "\n".join(f"- {r}" for r in (job.get("requirements") or [])[:40])
    resp = "\n".join(f"- {r}" for r in (job.get("responsibilities") or [])[:40])
    nice = "\n".join(f"- {r}" for r in (job.get("niceToHave") or [])[:20])
    tags = ", ".join((job.get("tags") or [])[:30])
    desc = (job.get("description") or "")[:12000]
    return f"""title: {job.get("title", "")}
company: {job.get("company", "")}
location: {job.get("location", "")}
workMode: {job.get("workMode", "")}
jobType: {job.get("jobType", "")}
tags: {tags}

--- description ---
{desc}

--- requirements ---
{reqs}

--- responsibilities ---
{resp}

--- nice to have ---
{nice}
"""


_PROFILE_TOP_KEYS = frozenset(
    {
        "fullName",
        "email",
        "phone",
        "country",
        "city",
        "headline",
        "summary",
        "workHistory",
        "education",
        "skills",
        "sourceCvStoragePath",
        "sourceCvFileName",
        "sourceCvUploadedAt",
        "linkedInUrl",
        "linkedinUrl",
        "linkedin",
        "websiteUrl",
        "website",
        "portfolioUrl",
        "githubUrl",
        "github",
        "twitterOrXUrl",
        "twitter",
        "mediumUrl",
        "xUrl",
        "additionalLinks",
    }
)


def _nonempty(s: Any) -> str:
    if s is None:
        return ""
    t = str(s).strip()
    return t


def _format_contact_block(profile: dict[str, Any]) -> str:
    """Every contact & social field we know — the CV must surface these when present."""
    lines: list[str] = [
        "=== CONTACT & LINKS (put name + these in the CV header; never invent; omit only if empty) ===",
        f"Full name: {_nonempty(profile.get('fullName'))}",
        f"Email: {_nonempty(profile.get('email'))}",
        f"Phone: {_nonempty(profile.get('phone'))}",
        f"City: {_nonempty(profile.get('city'))}",
        f"Country (ISO or text): {_nonempty(profile.get('country'))}",
    ]
    for key in (
        "linkedInUrl",
        "linkedinUrl",
        "linkedin",
        "websiteUrl",
        "website",
        "portfolioUrl",
        "githubUrl",
        "github",
        "mediumUrl",
        "xUrl",
        "twitterOrXUrl",
        "twitter",
    ):
        v = _nonempty(profile.get(key))
        if v:
            lines.append(f"{key}: {v}")
    ad = profile.get("additionalLinks")
    if isinstance(ad, list):
        lines.append("--- additionalLinks (include each on the CV header with its label) ---")
        for item in ad:
            if not isinstance(item, dict):
                continue
            label = _nonempty(item.get("label"))
            url = _nonempty(item.get("url"))
            if url:
                disp = label or "Link"
                lines.append(f"additionalLink: {disp} | {url}")
    return "\n".join(lines)


def _format_work_experience_block(profile: dict[str, Any]) -> str:
    wh = profile.get("workHistory") or []
    if not isinstance(wh, list) or not wh:
        return "=== WORK EXPERIENCE ===\n(none provided)"
    lines: list[str] = ["=== WORK EXPERIENCE (use reverse chronological order; include location if given) ==="]
    for w in wh[:12]:
        if not isinstance(w, dict):
            continue
        company = _nonempty(w.get("company"))
        role = _nonempty(w.get("role"))
        loc = _nonempty(w.get("location"))
        sd, ed = _nonempty(w.get("startDate")), w.get("endDate")
        ed_s = "Present" if ed is None else _nonempty(ed)
        head = f"- **{role}** at **{company}**" if company else f"- **{role}**"
        if loc:
            head += f" — {loc}"
        lines.append(head)
        lines.append(f"  Period: {sd} – {ed_s}")
        for a in (w.get("achievements") or [])[:16]:
            if not _nonempty(a):
                continue
            lines.append(f"  - {_nonempty(a)}")
        lines.append("")
    return "\n".join(lines).rstrip()


def _format_education_block(profile: dict[str, Any]) -> str:
    edu = profile.get("education") or []
    if not isinstance(edu, list) or not edu:
        return "=== EDUCATION ===\n(none provided)"
    lines: list[str] = ["=== EDUCATION ==="]
    for e in edu[:8]:
        if not isinstance(e, dict):
            continue
        school = _nonempty(e.get("school"))
        degree = _nonempty(e.get("degree"))
        field = _nonempty(e.get("field"))
        sd, edd = _nonempty(e.get("startDate")), e.get("endDate")
        ed_s = "Present" if edd is None else _nonempty(edd)
        lines.append(f"- {degree} in {field} — {school} ({sd} – {ed_s})")
    return "\n".join(lines)


def _format_skills_block(profile: dict[str, Any]) -> str:
    skills = profile.get("skills") or []
    if not isinstance(skills, list):
        return "=== SKILLS ===\n"
    slist = [str(s).strip() for s in skills if s and str(s).strip()]
    return "=== SKILLS (group or order to match the target job) ===\n" + ", ".join(slist)


def _format_narrative_block(profile: dict[str, Any]) -> str:
    h = _nonempty(profile.get("headline"))
    s = _nonempty(profile.get("summary"))
    return f"""=== HEADLINE & SUMMARY (weave into the CV; do not contradict facts below) ===
Headline: {h}

Summary:
{s}"""


def _profile_json_snapshot(profile: dict[str, Any], max_chars: int = 14_000) -> str:
    """Compact JSON for any field the app adds later; truncated for context limits."""
    try:
        out = json.dumps(profile, ensure_ascii=False, default=str, indent=2)
    except (TypeError, ValueError):
        return "{}"
    if len(out) > max_chars:
        return out[: max_chars - 3] + "…"
    return out


def _profile_block(profile: dict[str, Any]) -> str:
    """
    Rich structured profile for the LLM: contact, narrative, skills, work, education,
    plus extra URL-like fields and a full JSON snapshot.
    """
    extra_lines: list[str] = []
    for k, v in sorted(profile.items()):
        if k in _PROFILE_TOP_KEYS:
            continue
        if isinstance(v, str) and v.strip().startswith(("http://", "https://")):
            extra_lines.append(f"(extra) {k}: {v.strip()}")
    extra_block = "\n".join(extra_lines) if extra_lines else "(none)"
    wh_json = profile.get("workHistory") or []
    edu_json = profile.get("education") or []
    wh_compact = wh_json if isinstance(wh_json, list) else []
    edu_compact = edu_json if isinstance(edu_json, list) else []
    return f"""{_format_contact_block(profile)}

{_format_narrative_block(profile)}

{_format_skills_block(profile)}

{_format_work_experience_block(profile)}

{_format_education_block(profile)}

=== EXTRA URL-LIKE FIELDS ON PROFILE (include on CV if relevant) ===
{extra_block}

--- WORK_HISTORY_JSON (machine-readable; same data as above) ---
{json.dumps(wh_compact, ensure_ascii=False, default=str)}

--- EDUCATION_JSON ---
{json.dumps(edu_compact, ensure_ascii=False, default=str)}

--- FULL_PROFILE_JSON (authoritative; do not invent data not present here or in SOURCE_CV_TEXT) ---
{_profile_json_snapshot(profile)}
"""


def _model_name() -> str:
    return os.environ.get("VIBJOBBER_AGENT_MODEL", DEFAULT_AGENT_MODEL)


def _step_timeout() -> float:
    return float(os.environ.get("VIBJOBBER_DOC_AGENT_TIMEOUT_SEC", "300"))


async def _run_agent(name: str, instructions: str, user_message: str) -> Any:
    model = _model_name()
    agent = Agent(
        name=name,
        instructions=instructions,
        model=model,
    )
    return await asyncio.wait_for(Runner.run(agent, user_message), timeout=_step_timeout())


CV_DRAFT_INSTRUCTIONS = """You are an expert career coach and resume writer.
Output ONLY the CV body in Markdown (no preamble or postscript). Never wrap the output in ``` or any code fence.
Rules:
- Use real ATX headings: a space is required after the # characters in Markdown (e.g. "## Summary", not "##Summary").
- **Header (required):** Start with a single H1 of the full name, then a compact contact line or block on the next lines: email, phone, city/location, and **every** link from STRUCTURED_PROFILE / FULL_PROFILE_JSON: LinkedIn, GitHub, Medium, X/Twitter, **websiteUrl** (personal site or portfolio), and **each entry in additionalLinks** (use its label with the URL). Do not skip any of these when they are non-empty.
- **Formatting:** Consistent use of `##` section headings, bullet lines starting with `-`, blank lines between sections, and short readable lines (suitable for ATS and PDF). No walls of unbroken text.
- Use SOURCE_CV_TEXT as the primary source of truth for employers, dates, role titles, and achievements.
- Use STRUCTURED_PROFILE (and FULL_PROFILE_JSON) for all contact, social, work, education, and skills; resolve conflicts in favour of structured data unless SOURCE_CV_TEXT is clearly more up to date; if still unknown, omit rather than inventing.
- Tailor emphasis and ordering to the TARGET JOB: mirror honest keyword overlap from the job description.
- Use clear section headings, typically: # Name, then ## Professional summary, ## Experience, ## Education, ## Skills (or Skills before Education if stronger for the role). Adjust section order to highlight the best fit.
- Experience: reverse chronological; include role location when provided; use strong-verb achievement bullets; map to job requirements where true.
- Do NOT claim licenses, degrees, or employers that are not supported by SOURCE_CV_TEXT or STRUCTURED_PROFILE.
- If source material is thin, keep bullets concise and factual."""


CV_POLISH_INSTRUCTIONS = """You are an expert resume editor for ATS systems.
You receive a DRAFT CV in Markdown and the same job context.
Output ONLY the revised CV in Markdown. Never use ``` code fences. Keep a space after # in every heading (e.g. "## Experience").
- Tighten wording; remove redundancy; keep a professional one–two page equivalent length in Markdown.
- Ensure the **contact block** under the name still lists every email, phone, location, websiteUrl, every additionalLinks {label, url} pair, and every social link from STRUCTURED_PROFILE. Add missing contact lines if they were dropped.
- Keep formatting clean: clear ## headings, consistent bullet lists, good whitespace.
- Ensure keywords from the job appear where naturally true.
- Do not add new employers, dates, or credentials."""


COVER_INSTRUCTIONS = """You write concise, professional cover letters.
Output ONLY the letter body in plain Markdown. **Do not use a title or any # / ## / ### headings** — the letter is body text only. Never use ``` code fences.
- Start with a short date line (e.g. a single line with the day’s date) if appropriate, then a normal greeting (e.g. "Dear …" or "Hello …" or "Hi [team/company]"), then 3–4 body paragraphs, then a closing (e.g. "Sincerely,") and the candidate’s name on the last line.
- Use **bold** or *italics* inline only if helpful; do not use heading syntax.
- Use STRUCTURED_PROFILE (and FULL_PROFILE_JSON) and SOURCE_CV_TEXT for facts: name, email, phone, location, websiteUrl, additionalLinks (label + url), and other social links may appear in the sign-off or once in the header as plain text; do not invent employment or credentials.
- Address the specific role and company from the job context; show you read the role.
- Match tone to the industry implied by the job; clear paragraph breaks (blank line between paragraphs).
- No placeholder addresses; sign off with the candidate name from the profile; include contact (email) when natural."""


def _strip_cover_letter_headings(text: str) -> str:
    """Remove leading ATX heading lines in case the model still emits them."""
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        if re.match(r"^\s{0,3}#{1,6}\s", lines[i]):
            i += 1
            continue
        break
    return "\n".join(lines[i:]).strip()


async def generate_tailored_cv_async(
    profile: dict[str, Any],
    job: dict[str, Any],
    source_cv_text: str,
    source_meta: str,
) -> tuple[str, dict[str, Any]]:
    job_ctx = _job_context_block(job)
    prof = _profile_block(profile)
    base = f"""TARGET JOB:
{job_ctx}

STRUCTURED_PROFILE:
{prof}

SOURCE_CV_TEXT (primary facts; {source_meta}):
{source_cv_text or "[No uploaded source CV text — use STRUCTURED_PROFILE only.]"}
"""
    r1 = await _run_agent(
        "CV Drafter",
        CV_DRAFT_INSTRUCTIONS,
        base,
    )
    draft = str(r1.final_output or "").strip()
    if not draft:
        raise ValueError("CV drafter returned empty output")

    polish_input = f"""{base}

--- DRAFT_TO_POLISH ---
{draft}
"""
    r2 = await _run_agent(
        "CV Editor (ATS)",
        CV_POLISH_INSTRUCTIONS,
        polish_input,
    )
    final = str(r2.final_output or "").strip()
    if not final:
        final = draft
    model = _model_name()
    usage_dict = results_to_merged_dict(
        r1,
        r2,
        model=model,
        stage_names=["cv_draft", "cv_polish"],
    )
    return final, usage_dict


async def generate_cover_letter_async(
    profile: dict[str, Any],
    job: dict[str, Any],
    source_cv_text: str,
    source_meta: str,
) -> tuple[str, dict[str, Any]]:
    job_ctx = _job_context_block(job)
    prof = _profile_block(profile)
    msg = f"""TARGET JOB:
{job_ctx}

STRUCTURED_PROFILE:
{prof}

SOURCE_CV_TEXT (facts; {source_meta}):
{source_cv_text or "[No uploaded source CV — rely on profile.]"}
"""
    r = await _run_agent("Cover letter writer", COVER_INSTRUCTIONS, msg)
    text = _strip_cover_letter_headings(str(r.final_output or "").strip())
    if not text:
        raise ValueError("Cover letter agent returned empty output")
    model = _model_name()
    usage_dict = results_to_merged_dict(r, model=model, stage_names=["cover_letter"])
    return text, usage_dict


def run_generate_job_document_sync(
    db: Any,
    bucket: Any,
    *,
    user_id: str,
    job_id: str,
    kind: str,
) -> dict[str, Any]:
    user_ref = db.collection("users").document(user_id)
    us = user_ref.get()
    if not us.exists:
        raise ValueError("user not found")
    user_data = us.to_dict() or {}
    profile = user_data.get("profile")
    if not isinstance(profile, dict):
        raise ValueError("user profile missing")

    js = db.collection("jobs").document(job_id).get()
    if not js.exists:
        raise ValueError("job not found")
    job = js.to_dict() or {}

    path = profile.get("sourceCvStoragePath")
    if isinstance(path, str) and path.strip():
        cv_text, _pages, fmt = load_source_cv_text(bucket, path)
    else:
        cv_text, fmt = "", "no_upload"
    source_meta = fmt

    if kind == "cv":
        content, usage = asyncio.run(generate_tailored_cv_async(profile, job, cv_text, source_meta))
        return {
            "ok": True,
            "content": content,
            "title": f"CV — {profile.get('fullName', 'Candidate')} → {job.get('company', '')}",
            "internalLlm": usage,
        }
    if kind == "cover_letter":
        content, usage = asyncio.run(generate_cover_letter_async(profile, job, cv_text, source_meta))
        return {
            "ok": True,
            "content": content,
            "title": f"Cover Letter — {job.get('company', '')}",
            "internalLlm": usage,
        }
    raise ValueError("kind must be cv or cover_letter")
