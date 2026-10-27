# Synthetic sample inputs

This folder contains two paired, clearly labelled DOCX demo roles and resumes. They use
fictional candidate labels and explicit “required” language so the no-network mock provider can
exercise the complete profile, Talent Check and Skill Match flow. These fixtures are not part of
the official six-JD/four-resume acceptance set and must not be reported as official results.

Regenerate the files from the repository root with:

```powershell
uv run --project backend python backend/scripts/build_synthetic_demo_fixtures.py
```

Run the offline service-level workflow with:

```powershell
uv run --directory backend python scripts/evaluate_synthetic_demo.py
```

For an interactive walkthrough, upload a JD and resume from the matching role/candidate pair.
The seeded skillset ratings used by the evaluator are explicit demo self-reports; resume text
never supplies ratings.
