from pathlib import Path

from agents import Runner

from agents import build_agents
from store import JobStore


def job_excerpt(store: JobStore, job_index: int, max_chars: int = 14_000) -> str:
    job = store.postings[job_index]
    t = job.get("page_text") or job.get("snippet") or ""
    if not isinstance(t, str):
        return ""
    return t[:max_chars]


async def run_job_hunter(store: JobStore, output_dir: Path, message: str) -> str:
    agents = build_agents(store, output_dir)
    result = await Runner.run(agents["job_hunter"], message)
    return str(result.final_output)


async def run_sequential_application_pipeline(
    store: JobStore,
    output_dir: Path,
    job_index: int,
    candidate_profile: str,
) -> dict[str, str]:
    if job_index < 0 or job_index >= len(store):
        raise IndexError(f"job_index {job_index} invalid; list has {len(store)} jobs")

    agents = build_agents(store, output_dir)

    r_fetch = await Runner.run(
        agents["job_page_fetch"],
        f"job_index={job_index}. Fetch this job posting.",
    )

    excerpt = job_excerpt(store, job_index)

    r_cover = await Runner.run(
        agents["cover_letter"],
        f"job_index={job_index}\n\ncandidate_profile:\n{candidate_profile}\n\n"
        f"job_page_excerpt:\n{excerpt}\n",
    )

    r_cv = await Runner.run(
        agents["cv"],
        f"job_index={job_index}\n\ncandidate_profile:\n{candidate_profile}\n\n"
        f"job_page_excerpt:\n{excerpt}\n",
    )

    r_form = await Runner.run(
        agents["form_filler"],
        f"job_index={job_index}\n\ncandidate_profile:\n{candidate_profile}\n\n"
        f"job_page_excerpt:\n{excerpt}\n",
    )

    return {
        "fetch": str(r_fetch.final_output),
        "cover_letter": str(r_cover.final_output),
        "cv": str(r_cv.final_output),
        "form_plan": str(r_form.final_output),
    }


async def run_search_then_pipeline_first_job(
    store: JobStore,
    output_dir: Path,
    search_message: str,
    candidate_profile: str,
) -> dict[str, str]:
    await run_job_hunter(store, output_dir, search_message)
    if not store.postings:
        return {}
    return await run_sequential_application_pipeline(
        store, output_dir, 0, candidate_profile
    )
