"""Versioned RADIX skillset registry.

One place that knows:

* the 12 category codes and their display names (the codes match the supplied
  company CSV and the level-ladder CSV);
* the 10-level topic ladder used to explain self-reported ratings;
* a small canonical skill list with approved aliases, used by Skill Matching.

The registry is data, not a model call: normalisation and alias resolution are
deterministic so the same input always produces the same match.
"""

from __future__ import annotations

import csv
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.config import settings
from app.contracts.v1 import RADIX_CATEGORY_CODES, CategoryCode

REGISTRY_VERSION = "1.0.0"

CATEGORY_NAMES: dict[CategoryCode, str] = {
    CategoryCode.COD: "Coding",
    CategoryCode.DSA: "Data Structures and Algorithms",
    CategoryCode.OOD: "Object-Oriented Programming and Design",
    CategoryCode.APTI: "Aptitude and Problem Solving",
    CategoryCode.COMM: "Communication Skills",
    CategoryCode.AI: "AI Native Engineering",
    CategoryCode.CLOUD: "DevOps and Cloud",
    CategoryCode.SQL: "SQL and Design",
    CategoryCode.SWE: "Software Engineering",
    CategoryCode.SYSD: "System Design and Architecture",
    CategoryCode.NETW: "Computer Networking",
    CategoryCode.OS: "Operating System",
}

_STRIP_CHARS = " \t\r\n.,;:!?()[]{}\"'`|/\\-\u2010\u2011\u2012\u2013\u2014"
_LEVEL_ROW = re.compile(r"level\s*(\d{1,2})", re.IGNORECASE)


def normalize_skill_name(name: str) -> str:
    """Return the deterministic match key for a skill name.

    Case, spacing and surrounding punctuation are ignored. ``C``, ``C++`` and
    ``C#`` stay distinct: ``+`` and ``#`` are never stripped.
    """

    text = unicodedata.normalize("NFKC", name or "").casefold()
    text = text.replace("&", " and ")
    text = re.sub(r"\s+", " ", text)
    return text.strip(_STRIP_CHARS)


@dataclass(frozen=True, slots=True)
class CanonicalSkill:
    skill_id: str
    display_name: str
    category_code: CategoryCode
    aliases: tuple[str, ...] = ()


CANONICAL_SKILLS: tuple[CanonicalSkill, ...] = (
    # Coding
    CanonicalSkill("python", "Python", CategoryCode.COD, ("python3", "python 3")),
    CanonicalSkill("java", "Java", CategoryCode.COD),
    CanonicalSkill("javascript", "JavaScript", CategoryCode.COD, ("js", "ecmascript")),
    CanonicalSkill("typescript", "TypeScript", CategoryCode.COD, ("ts",)),
    CanonicalSkill("c", "C", CategoryCode.COD),
    CanonicalSkill("cpp", "C++", CategoryCode.COD, ("cpp", "cplusplus", "c plus plus")),
    CanonicalSkill("csharp", "C#", CategoryCode.COD, ("c sharp", "csharp")),
    CanonicalSkill("go", "Go", CategoryCode.COD, ("golang",)),
    CanonicalSkill("rust", "Rust", CategoryCode.COD),
    CanonicalSkill("kotlin", "Kotlin", CategoryCode.COD),
    CanonicalSkill("swift", "Swift", CategoryCode.COD),
    CanonicalSkill("php", "PHP", CategoryCode.COD),
    CanonicalSkill("ruby", "Ruby", CategoryCode.COD),
    CanonicalSkill("scala", "Scala", CategoryCode.COD),
    CanonicalSkill("r", "R", CategoryCode.COD),
    CanonicalSkill("dart", "Dart", CategoryCode.COD),
    CanonicalSkill("bash", "Bash", CategoryCode.COD, ("shell", "bash scripting")),
    CanonicalSkill("html", "HTML", CategoryCode.COD),
    CanonicalSkill("css", "CSS", CategoryCode.COD),
    # Data Structures and Algorithms
    CanonicalSkill(
        "dsa",
        "Data Structures and Algorithms",
        CategoryCode.DSA,
        ("data structures", "algorithms", "data structures and algorithms"),
    ),
    CanonicalSkill("competitive-programming", "Competitive Programming", CategoryCode.DSA),
    # Object-Oriented Programming and Design
    CanonicalSkill(
        "oop",
        "Object-Oriented Programming",
        CategoryCode.OOD,
        ("object oriented programming", "object-oriented design", "oops"),
    ),
    CanonicalSkill("solid", "SOLID Principles", CategoryCode.OOD, ("solid principles",)),
    CanonicalSkill("design-patterns", "Design Patterns", CategoryCode.OOD, ("gof patterns",)),
    CanonicalSkill("uml", "UML", CategoryCode.OOD, ("uml diagrams",)),
    # Aptitude and Problem Solving
    CanonicalSkill(
        "aptitude",
        "Aptitude",
        CategoryCode.APTI,
        ("quantitative aptitude", "aptitude and problem solving"),
    ),
    CanonicalSkill("logical-reasoning", "Logical Reasoning", CategoryCode.APTI, ("reasoning",)),
    CanonicalSkill(
        "probability-statistics",
        "Probability and Statistics",
        CategoryCode.APTI,
        ("statistics", "probability"),
    ),
    CanonicalSkill("data-interpretation", "Data Interpretation", CategoryCode.APTI),
    # Communication Skills
    CanonicalSkill(
        "communication",
        "Communication Skills",
        CategoryCode.COMM,
        ("communication", "verbal communication"),
    ),
    CanonicalSkill(
        "technical-writing",
        "Technical Writing",
        CategoryCode.COMM,
        ("documentation", "writing documentation"),
    ),
    CanonicalSkill(
        "presentation",
        "Presentation Skills",
        CategoryCode.COMM,
        ("public speaking", "presentations"),
    ),
    CanonicalSkill(
        "stakeholder-management",
        "Stakeholder Management",
        CategoryCode.COMM,
        ("client communication",),
    ),
    # AI Native Engineering
    CanonicalSkill("prompt-engineering", "Prompt Engineering", CategoryCode.AI, ("prompting",)),
    CanonicalSkill(
        "llm", "Large Language Models", CategoryCode.AI, ("llms", "large language model")
    ),
    CanonicalSkill(
        "rag",
        "Retrieval-Augmented Generation",
        CategoryCode.AI,
        ("retrieval augmented generation", "rag pipelines"),
    ),
    CanonicalSkill("langchain", "LangChain", CategoryCode.AI),
    CanonicalSkill("openai-api", "OpenAI API", CategoryCode.AI, ("openai",)),
    CanonicalSkill("generative-ai", "Generative AI", CategoryCode.AI, ("genai", "gen ai")),
    CanonicalSkill("machine-learning", "Machine Learning", CategoryCode.AI, ("ml",)),
    CanonicalSkill("pytorch", "PyTorch", CategoryCode.AI),
    CanonicalSkill("tensorflow", "TensorFlow", CategoryCode.AI),
    CanonicalSkill(
        "ai-assisted-development",
        "AI-Assisted Development",
        CategoryCode.AI,
        ("ai coding assistants", "copilot", "github copilot"),
    ),
    # DevOps and Cloud
    CanonicalSkill("aws", "AWS", CategoryCode.CLOUD, ("amazon web services",)),
    CanonicalSkill("azure", "Microsoft Azure", CategoryCode.CLOUD, ("azure",)),
    CanonicalSkill(
        "gcp",
        "Google Cloud Platform",
        CategoryCode.CLOUD,
        ("google cloud", "google cloud platform"),
    ),
    CanonicalSkill("docker", "Docker", CategoryCode.CLOUD),
    CanonicalSkill("kubernetes", "Kubernetes", CategoryCode.CLOUD, ("k8s",)),
    CanonicalSkill("terraform", "Terraform", CategoryCode.CLOUD),
    CanonicalSkill(
        "ci-cd",
        "CI/CD",
        CategoryCode.CLOUD,
        ("continuous integration", "ci cd", "cicd", "continuous delivery"),
    ),
    CanonicalSkill("github-actions", "GitHub Actions", CategoryCode.CLOUD),
    CanonicalSkill("jenkins", "Jenkins", CategoryCode.CLOUD),
    CanonicalSkill("devops", "DevOps", CategoryCode.CLOUD, ("dev ops",)),
    CanonicalSkill("nginx", "Nginx", CategoryCode.CLOUD),
    # SQL and Design
    CanonicalSkill("sql", "SQL", CategoryCode.SQL, ("structured query language",)),
    CanonicalSkill("mysql", "MySQL", CategoryCode.SQL),
    CanonicalSkill("postgresql", "PostgreSQL", CategoryCode.SQL, ("postgres", "psql")),
    CanonicalSkill("sqlite", "SQLite", CategoryCode.SQL),
    CanonicalSkill("mongodb", "MongoDB", CategoryCode.SQL, ("mongo",)),
    CanonicalSkill("redis", "Redis", CategoryCode.SQL),
    CanonicalSkill(
        "database-design",
        "Database Design",
        CategoryCode.SQL,
        ("schema design", "data modeling"),
    ),
    # Software Engineering
    CanonicalSkill("git", "Git", CategoryCode.SWE),
    CanonicalSkill("github", "GitHub", CategoryCode.SWE),
    CanonicalSkill("nodejs", "Node.js", CategoryCode.SWE, ("nodejs", "node js")),
    CanonicalSkill(
        "testing",
        "Software Testing",
        CategoryCode.SWE,
        ("unit testing", "test automation"),
    ),
    CanonicalSkill("pytest", "pytest", CategoryCode.SWE),
    CanonicalSkill("jest", "Jest", CategoryCode.SWE),
    CanonicalSkill("agile", "Agile", CategoryCode.SWE, ("scrum",)),
    CanonicalSkill("code-review", "Code Review", CategoryCode.SWE, ("pull request review",)),
    CanonicalSkill("debugging", "Debugging", CategoryCode.SWE),
    CanonicalSkill("software-engineering", "Software Engineering", CategoryCode.SWE, ("sdlc",)),
    # System Design and Architecture
    CanonicalSkill(
        "system-design",
        "System Design",
        CategoryCode.SYSD,
        ("systems design", "hld", "high level design"),
    ),
    CanonicalSkill("low-level-design", "Low-Level Design", CategoryCode.SYSD, ("lld",)),
    CanonicalSkill("microservices", "Microservices", CategoryCode.SYSD),
    CanonicalSkill(
        "rest-api",
        "REST APIs",
        CategoryCode.SYSD,
        ("rest", "restful apis", "api design"),
    ),
    CanonicalSkill("graphql", "GraphQL", CategoryCode.SYSD),
    CanonicalSkill("distributed-systems", "Distributed Systems", CategoryCode.SYSD),
    CanonicalSkill("architecture", "Software Architecture", CategoryCode.SYSD, ("architecture",)),
    # Computer Networking
    CanonicalSkill(
        "networking",
        "Computer Networking",
        CategoryCode.NETW,
        ("networking", "computer networks"),
    ),
    CanonicalSkill("tcp-ip", "TCP/IP", CategoryCode.NETW, ("tcp ip",)),
    CanonicalSkill("http", "HTTP", CategoryCode.NETW, ("https",)),
    CanonicalSkill("dns", "DNS", CategoryCode.NETW),
    CanonicalSkill("sockets", "Socket Programming", CategoryCode.NETW, ("sockets", "websockets")),
    CanonicalSkill("load-balancing", "Load Balancing", CategoryCode.NETW, ("load balancer",)),
    # Operating System
    CanonicalSkill("linux", "Linux", CategoryCode.OS, ("ubuntu",)),
    CanonicalSkill("unix", "Unix", CategoryCode.OS),
    CanonicalSkill("windows", "Windows", CategoryCode.OS),
    CanonicalSkill("shell-scripting", "Shell Scripting", CategoryCode.OS, ("shell scripts",)),
    CanonicalSkill("concurrency", "Concurrency", CategoryCode.OS, ("multithreading", "threading")),
    CanonicalSkill("memory-management", "Memory Management", CategoryCode.OS),
)

_SKILL_INDEX: dict[str, CanonicalSkill] = {}


def _build_skill_index() -> dict[str, CanonicalSkill]:
    index: dict[str, CanonicalSkill] = {}
    for skill in CANONICAL_SKILLS:
        for key in (skill.skill_id, skill.display_name, *skill.aliases):
            normalised = normalize_skill_name(key)
            existing = index.get(normalised)
            if existing is not None and existing != skill:
                raise ValueError(
                    f"registry key {key!r} maps to both {existing.skill_id!r} "
                    f"and {skill.skill_id!r}"
                )
            index[normalised] = skill
    return index


def _skill_index() -> dict[str, CanonicalSkill]:
    if not _SKILL_INDEX:
        _SKILL_INDEX.update(_build_skill_index())
    return _SKILL_INDEX


def resolve_skill(name: str) -> CanonicalSkill | None:
    """Resolve a name by canonical id, display name or approved alias."""

    return _skill_index().get(normalize_skill_name(name))


@lru_cache(maxsize=4)
def load_level_ladder(
    path: Path | None = None,
) -> dict[CategoryCode, dict[int, list[str]]]:
    """Read the supplied 10-level topic ladder that explains each rating.

    The ladder is guidance for a self-reported level, never a measurement of
    candidate ability.
    """

    csv_path = path or (
        settings.data_dir / "reference" / "source" / "staging_skill_topics_fixed.csv"
    )
    if not csv_path.is_file():
        raise FileNotFoundError(f"skill topic CSV not found: {csv_path}")

    area_to_code = {normalize_skill_name(name): code for code, name in CATEGORY_NAMES.items()}
    ladder: dict[CategoryCode, dict[int, list[str]]] = {}

    with csv_path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            area = (row.get("skill_area") or "").strip()
            code = area_to_code.get(normalize_skill_name(area))
            if code is None:
                raise ValueError(f"unknown skill area in topic CSV: {area!r}")
            match = _LEVEL_ROW.search(row.get("levels") or "")
            if match is None:
                raise ValueError(f"unparsable level value for {area!r}: {row.get('levels')!r}")
            topics = [
                topic.strip(" .")
                for topic in (row.get("topics") or "").split(";")
                if topic.strip(" .")
            ]
            ladder.setdefault(code, {})[int(match.group(1))] = topics

    incomplete = [
        code.value
        for code in RADIX_CATEGORY_CODES
        if sorted(ladder.get(code, {})) != list(range(1, 11))
    ]
    if incomplete:
        raise ValueError(f"level ladder is incomplete for categories: {incomplete}")
    return ladder
