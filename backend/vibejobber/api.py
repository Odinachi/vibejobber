from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .config import OUTPUT_DIR
from .models import job_to_public
from .pipeline import (
    run_job_hunter,
    run_search_then_pipeline_first_job,
    run_sequential_application_pipeline,
)
from .serper import ingest_serper_results, search_jobs
from .store import JobStore


class AppState:
    def __init__(self) -> None:
        self.sessions: dict[str, JobStore] = {}

    def get_store(self, session_id: str) -> JobStore:
        if session_id not in self.sessions:
            self.sessions[session_id] = JobStore()
        return self.sessions[session_id]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.vibe = AppState()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Vibejobber API",
        description="Serper job search, page fetch, and OpenAI Agents application pipeline.",
        lifespan=lifespan,
    )

    def store_for(session_id: str | None) -> JobStore:
        sid = session_id or "default"
        return app.state.vibe.get_store(sid)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/jobs")
    def list_jobs(x_session_id: str | None = Header(default=None)) -> dict[str, Any]:
        st = store_for(x_session_id)
        return {"jobs": [job_to_public(j) for j in st.postings], "count": len(st)}

    class SearchOnlyBody(BaseModel):
        job_title: str
        num: int = 10
        or_terms: list[str] | None = None
        past_week: bool = True

    @app.post("/search/raw")
    def search_raw(
        body: SearchOnlyBody,
        x_session_id: str | None = Header(default=None),
    ) -> dict[str, Any]:
        """Serper search + ingest into session store (no LLM)."""
        st = store_for(x_session_id)
        data = search_jobs(
            body.job_title,
            num=body.num,
            or_terms=body.or_terms,
            past_week=body.past_week,
        )
        n = ingest_serper_results(st, data, replace=True)
        return {
            "ingested": n,
            "searchParameters": data.get("searchParameters"),
            "jobs": [job_to_public(j) for j in st.postings],
        }

    class HunterBody(BaseModel):
        message: str = Field(..., description="Natural language search instructions for the Job Hunter agent")

    @app.post("/agents/job-hunter")
    async def job_hunter(
        body: HunterBody,
        x_session_id: str | None = Header(default=None),
    ) -> dict[str, str]:
        st = store_for(x_session_id)
        summary = await run_job_hunter(st, OUTPUT_DIR, body.message)
        return {"summary": summary}

    class PipelineBody(BaseModel):
        job_index: int = Field(..., ge=0)
        candidate_profile: str

    @app.post("/agents/pipeline")
    async def pipeline(
        body: PipelineBody,
        x_session_id: str | None = Header(default=None),
    ) -> dict[str, str]:
        st = store_for(x_session_id)
        if body.job_index >= len(st):
            raise HTTPException(400, "job_index out of range; run /search/raw or /agents/job-hunter first")
        out = await run_sequential_application_pipeline(
            st, OUTPUT_DIR, body.job_index, body.candidate_profile
        )
        return out

    class SearchPipelineBody(BaseModel):
        search_message: str
        candidate_profile: str

    @app.post("/agents/search-and-pipeline")
    async def search_and_pipeline(
        body: SearchPipelineBody,
        x_session_id: str | None = Header(default=None),
    ) -> dict[str, str]:
        st = store_for(x_session_id)
        out = await run_search_then_pipeline_first_job(
            st, OUTPUT_DIR, body.search_message, body.candidate_profile
        )
        if not out:
            raise HTTPException(400, "No jobs returned from search; check SERPER_API_KEY and query")
        return out

    return app
