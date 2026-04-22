import json
from pathlib import Path
from typing import Annotated, Any

from agents import function_tool

from artifacts import (
    save_cover_letter_impl,
    save_cv_impl,
    save_form_fill_plan_impl,
)
from scraping import fetch_job_page_text
from serper import ingest_serper_results, search_jobs
from store import JobStore


def build_agent_tools(store: JobStore, output_dir: Path) -> dict[str, Any]:
    @function_tool
    def search_job_boards(
        job_title: Annotated[str, "Core role or stack, e.g. Flutter, Staff Backend"],
        extra_keywords: Annotated[
            str,
            "Optional comma-separated OR terms, e.g. 'mobile developer, iOS'",
        ] = "",
        num_results: Annotated[int, "How many Google results to return"] = 10,
        past_week: Annotated[bool, "Restrict to past week in Google"] = True,
    ) -> str:
        extras = [s.strip() for s in extra_keywords.split(",") if s.strip()] or None
        data = search_jobs(job_title, num=num_results, or_terms=extras, past_week=past_week)
        ingest_serper_results(store, data, replace=True)
        slim = [
            {"id": j["id"], "title": j["title"], "link": j["link"], "snippet": j["snippet"]}
            for j in store.postings
        ]
        out = {
            "search_query": data.get("searchParameters", {}).get("q"),
            "stored_jobs": slim,
            "count": len(slim),
        }
        return json.dumps(out, indent=2)

    @function_tool
    def fetch_job_page(
        job_index: Annotated[int, "0-based index into job list (same order as search)"],
    ) -> str:
        result = fetch_job_page_text(store, job_index)
        if "error" in result and "job_id" not in result:
            return json.dumps(result)
        return json.dumps(result, indent=2)

    @function_tool
    def save_cover_letter(
        job_index: Annotated[int, "Index in job list"],
        letter_body: Annotated[str, "Full cover letter text"],
        file_format: Annotated[str, "txt or pdf — match what the posting / form asks for"],
    ) -> str:
        payload = save_cover_letter_impl(store, output_dir, job_index, letter_body, file_format)
        return json.dumps(payload)

    @function_tool
    def save_cv_for_job(
        job_index: Annotated[int, "Index in job list"],
        cv_body: Annotated[str, "CV content tailored to the role (plain or markdown)"],
        file_format: Annotated[str, "txt or pdf"],
    ) -> str:
        payload = save_cv_impl(store, output_dir, job_index, cv_body, file_format)
        return json.dumps(payload)

    @function_tool
    def save_form_fill_plan(
        job_index: Annotated[int, "Index in job list"],
        plan_json: Annotated[
            str,
            'JSON string: {"fields":[{"name":"...","value":"..."}], "notes":"..."}',
        ],
    ) -> str:
        payload = save_form_fill_plan_impl(store, output_dir, job_index, plan_json)
        return json.dumps(payload)

    return {
        "search_job_boards": search_job_boards,
        "fetch_job_page": fetch_job_page,
        "save_cover_letter": save_cover_letter,
        "save_cv_for_job": save_cv_for_job,
        "save_form_fill_plan": save_form_fill_plan,
    }
