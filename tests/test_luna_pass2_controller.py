import csv
import json
import subprocess
import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pass2.luna_pass2_controller as controller
from pass2.luna_pass2_controller import ControllerConfig, ControllerError, MockAdapter, paper_source, run_controller, select_rows, validate_result


def write_csv(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def terminal_result(paper_id: str, title: str) -> list[dict[str, str]]:
    return [{
        "paper_id": paper_id,
        "paper_title": title,
        "terminal_outcome": "DROP",
        "reason": "Targeted inspection found no in-scope mechanism.",
    }]


def test_mock_run_writes_only_assigned_blank_row_and_is_resumable(tmp_path: Path) -> None:
    master = tmp_path / "program-a-paper-master.csv"
    manifest = tmp_path / "manifest.csv"
    fields = ["paper_id", "paper_name", "abstract", "triage_label", "lanes", "pass2_result"]
    write_csv(master, fields, [
        {"paper_id": "p-1", "paper_name": "One", "abstract": "a", "triage_label": "LOW", "lanes": "A1", "pass2_result": ""},
        {"paper_id": "p-2", "paper_name": "Two", "abstract": "b", "triage_label": "HIGH", "lanes": "A2", "pass2_result": ""},
        {"paper_id": "p-3", "paper_name": "Three", "abstract": "c", "triage_label": "HIGH", "lanes": "A3", "pass2_result": json.dumps(terminal_result("p-3", "Three"))},
    ])
    write_csv(manifest, ["paper_id", "assigned_agent"], [
        {"paper_id": "p-1", "assigned_agent": "3"},
        {"paper_id": "p-2", "assigned_agent": "4"},
        {"paper_id": "p-3", "assigned_agent": "3"},
    ])

    config = ControllerConfig(program="A", worker="a-03", master_path=master, manifest_path=manifest, log_dir=tmp_path / "logs")
    report = run_controller(config, MockAdapter({"p-1": terminal_result("p-1", "One")}))

    assert report.completed == ["p-1"]
    rows = {row["paper_id"]: row for row in read_csv(master)}
    assert json.loads(rows["p-1"]["pass2_result"])[0]["paper_id"] == "p-1"
    assert rows["p-2"]["pass2_result"] == ""
    assert json.loads(rows["p-3"]["pass2_result"])[0]["paper_id"] == "p-3"
    assert (tmp_path / "program-a-paper-master.csv.backup").exists()

    repeat = run_controller(config, MockAdapter({}))
    assert repeat.selected == []


def test_manifest_arxiv_identifier_resolves_to_master_paper_id(tmp_path: Path) -> None:
    master = tmp_path / "program-a-paper-master.csv"
    manifest = tmp_path / "manifest.csv"
    fields = ["paper_id", "source_ids", "paper_name", "abstract", "triage_label", "lanes", "pass2_result"]
    write_csv(master, fields, [
        {"paper_id": "internal-1", "source_ids": "arxiv:2606.22480", "paper_name": "One", "abstract": "a", "triage_label": "HIGH", "lanes": "A1", "pass2_result": ""},
        {"paper_id": "internal-2", "source_ids": "arxiv:2606.22481", "paper_name": "Two", "abstract": "b", "triage_label": "HIGH", "lanes": "A1", "pass2_result": ""},
    ])
    write_csv(manifest, ["paper_id", "assigned_agent"], [
        {"paper_id": "arxiv:2606.22480", "assigned_agent": "1"},
    ])

    config = ControllerConfig(program="A", worker="a-01", master_path=master, manifest_path=manifest, log_dir=tmp_path / "logs")
    report = run_controller(config, MockAdapter({"internal-1": terminal_result("internal-1", "One")}))

    assert report.completed == ["internal-1"]
    rows = {row["paper_id"]: row for row in read_csv(master)}
    assert rows["internal-1"]["pass2_result"]
    assert rows["internal-2"]["pass2_result"] == ""


def test_invalid_result_never_changes_master(tmp_path: Path) -> None:
    master = tmp_path / "program-b-paper-master.csv"
    manifest = tmp_path / "manifest.csv"
    fields = ["paper_id", "paper_name", "abstract", "triage_label", "lanes", "pass2_result"]
    write_csv(master, fields, [{"paper_id": "p-1", "paper_name": "One", "abstract": "a", "triage_label": "MEDIUM", "lanes": "B1", "pass2_result": ""}])
    write_csv(manifest, ["paper_id", "assigned_agent"], [{"paper_id": "p-1", "assigned_agent": "1"}])

    config = ControllerConfig(program="B", worker="b-01", master_path=master, manifest_path=manifest, log_dir=tmp_path / "logs")
    report = run_controller(config, MockAdapter({"p-1": terminal_result("wrong-id", "One")}))

    assert report.completed == []
    assert report.failures[0].paper_id == "p-1"
    assert read_csv(master)[0]["pass2_result"] == ""


def test_terminal_record_rejects_extra_or_malformed_fields() -> None:
    value = terminal_result("p-1", "One")[0]
    value["unexpected"] = "not allowed"
    with pytest.raises(ControllerError):
        validate_result("A", "p-1", [value])


def test_paper_source_prefers_arxiv_pdf_and_rejects_non_web_locations() -> None:
    assert paper_source({"source_ids": "arxiv:1712.03361", "arxiv_id": "arxiv:9999.00001", "url": "https://example.invalid"}) == (
        "pdf", "https://arxiv.org/pdf/1712.03361.pdf",
    )
    assert paper_source({"url": "file:///private/paper.pdf"}) is None
    assert paper_source({"doi": "10.1000/example"}) == ("web", "https://doi.org/10.1000/example")


@pytest.mark.skipif(controller.os.name != "nt", reason="Windows-only process behavior")
def test_windows_helper_commands_are_hidden() -> None:
    kwargs = controller.hidden_process_kwargs()

    assert kwargs["creationflags"] == subprocess.CREATE_NO_WINDOW
    assert kwargs["startupinfo"].wShowWindow == subprocess.SW_HIDE


def test_cli_uses_explicit_manifest(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    manifest = tmp_path / "remaining.csv"
    seen: dict[str, ControllerConfig] = {}

    monkeypatch.setattr(controller, "DockerLunaAdapter", lambda config: object())
    monkeypatch.setattr(controller, "run_controller", lambda config, adapter: (seen.setdefault("config", config), controller.RunReport())[1])

    assert controller.main(["--program", "A", "--worker", "a-01", "--manifest", str(manifest)]) == 0
    assert seen["config"].manifest == manifest


def test_select_rows_deduplicates_master_paper_ids(tmp_path: Path) -> None:
    master = tmp_path / "program-a-paper-master.csv"
    manifest = tmp_path / "manifest.csv"
    fields = ["paper_id", "paper_name", "abstract", "triage_label", "lanes", "pass2_result"]
    write_csv(master, fields, [
        {"paper_id": "p-1", "paper_name": "One", "abstract": "a", "triage_label": "HIGH", "lanes": "A1", "pass2_result": ""},
        {"paper_id": "p-1", "paper_name": "One duplicate", "abstract": "a", "triage_label": "HIGH", "lanes": "A1", "pass2_result": ""},
    ])
    write_csv(manifest, ["paper_id", "assigned_agent"], [{"paper_id": "p-1", "assigned_agent": "1"}])

    rows = select_rows(ControllerConfig(program="A", worker="a-01", master_path=master, manifest_path=manifest))

    assert [row["paper_id"] for row in rows] == ["p-1"]


def test_worker_continues_after_one_failed_paper(tmp_path: Path) -> None:
    master = tmp_path / "program-a-paper-master.csv"
    manifest = tmp_path / "manifest.csv"
    fields = ["paper_id", "paper_name", "abstract", "triage_label", "lanes", "pass2_result"]
    write_csv(master, fields, [
        {"paper_id": "p-1", "paper_name": "One", "abstract": "a", "triage_label": "HIGH", "lanes": "A1", "pass2_result": ""},
        {"paper_id": "p-2", "paper_name": "Two", "abstract": "b", "triage_label": "HIGH", "lanes": "A1", "pass2_result": ""},
    ])
    write_csv(manifest, ["paper_id", "assigned_agent"], [{"paper_id": "p-1", "assigned_agent": "1"}, {"paper_id": "p-2", "assigned_agent": "1"}])

    report = run_controller(
        ControllerConfig(program="A", worker="a-01", master_path=master, manifest_path=manifest, log_dir=tmp_path / "logs"),
        MockAdapter({"p-1": terminal_result("wrong-id", "One"), "p-2": terminal_result("p-2", "Two")}),
    )

    assert [failure.paper_id for failure in report.failures] == ["p-1"]
    assert report.completed == ["p-2"]
