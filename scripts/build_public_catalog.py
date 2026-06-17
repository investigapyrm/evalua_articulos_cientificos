#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import shutil
from collections import Counter
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent

SOURCE_CSV = WORKSPACE_ROOT / "04_INVESTIGACION_REPO" / "tabla_validacion_humano_vs_ia_auditables_346.csv"
PRIMARY_PDF_DIR = WORKSPACE_ROOT / "04_INVESTIGACION_REPO" / "pdfs_articulos_rtcoh_20260423"
FALLBACK_PDF_DIR = WORKSPACE_ROOT / "04_INVESTIGACION_REPO" / "pdfs_articulos_rtcoh_20260423_smoke"
SUMMARY_CSV = REPO_ROOT / "data" / "reporte_online_humano_vs_ia_resumen.csv"
ANON_MANIFEST_CSV = REPO_ROOT / "public_data" / "anonymized_pdf_manifest.csv"

OUTPUT_DATA_DIR = REPO_ROOT / "public_data"
OUTPUT_PDF_DIR = REPO_ROOT / "public_pdfs"
OUTPUT_JSON = OUTPUT_DATA_DIR / "auditables_346.json"

# Metricas declaradas por el manuscrito final sometido a DADOS.
# Fuente local de control: 03_TESIS/RESOMETIMIENTO_DADOS_2026-06-16/
# documentos_editables/manuscrito_principal_anonimizado_dados.html
ARTICLE_REFERENCE_METRICS = {
    "corpus_auditables": {"n": 346, "label": "Casos auditables"},
    "pdf_disponibles": {"n": 346, "label": "PDF disponibles"},
    "pdf_faltantes": {"n": 0, "label": "PDF faltantes"},
    "a_no_prob": {"n": 231, "pct_corpus": 66.8, "label": "Muestreo no probabilistico"},
    "b_reconoce_limites": {"n": 165, "pct_corpus": 47.7, "label": "Reconocimiento de limites"},
    "c_extrapola": {"n": 263, "pct_corpus": 76.0, "label": "Extrapolacion a dominio amplio"},
    "ac_einr": {
        "n": 181,
        "pct_corpus": 52.3,
        "pct_a_subset": 78.4,
        "label": "EINR A∩C",
    },
    "ac_sin_reconocimiento": {
        "n": 83,
        "pct_a_subset": 35.9,
        "pct_corpus": 24.0,
        "label": "A∩C sin reconocimiento",
    },
    "abc_con_reconocimiento": {
        "n": 98,
        "pct_a_subset": 42.4,
        "pct_corpus": 28.3,
        "label": "A∩B∩C con reconocimiento",
    },
    "source_note": "Metricas tomadas del manuscrito final sometido a DADOS (17 June 2026 local workspace snapshot).",
}


def to_text(value: str | None) -> str:
    return (value or "").strip()


def to_int(value: str | None):
    value = to_text(value)
    if not value:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def to_num(value: str | None):
    value = to_text(value)
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def normalize_reference_text(value: str | None) -> str:
    text = to_text(value)
    if not text:
        return ""
    replacements = {
        "Corregir a juicio humano:": "Corregir segun codificacion de referencia:",
        "juicio humano": "codificacion de referencia",
        "Juicio humano": "Codificacion de referencia",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def load_rows():
    with SOURCE_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def load_anonymized_map():
    if not ANON_MANIFEST_CSV.exists():
        return {}
    with ANON_MANIFEST_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        return {row["original_name"]: row for row in csv.DictReader(fh)}


def find_pdf(pdf_name: str) -> Path | None:
    for base in (PRIMARY_PDF_DIR, FALLBACK_PDF_DIR):
        candidate = base / pdf_name
        if candidate.exists():
            return candidate
    return None


def record_from_row(row: dict[str, str], pdf_path: Path | None, anon_row: dict[str, str] | None):
    anon_public_path = ""
    anon_available = False
    public_id = ""
    public_name = ""
    anonymization = {}
    if anon_row:
        anon_public_path = to_text(anon_row.get("public_path"))
        anon_available = (REPO_ROOT / anon_public_path).exists() if anon_public_path else False
        public_id = to_text(anon_row.get("public_id"))
        public_name = to_text(anon_row.get("public_name"))
        anonymization = {
            "public_id": public_id,
            "public_name": public_name,
            "strategy": to_text(anon_row.get("strategy")),
            "flags": [flag for flag in to_text(anon_row.get("flags")).split(";") if flag],
        }

    case_label = public_id.upper() if public_id else f"CASE_{to_int(row.get('pdf_id')):04d}"
    display_title = "Caso anonimizado para verificacion metodologica" if anon_available else to_text(row.get("titulo"))
    display_source = "Identidad editorial suprimida" if anon_available else to_text(row.get("revista"))
    display_pdf_name = public_name if anon_available else to_text(row.get("pdf_nombre"))
    search_text = " ".join(
        part
        for part in [
            case_label,
            display_title,
            display_source,
            to_text(row.get("pais")),
            to_text(row.get("macroarea")),
            to_text(row.get("veredicto_ia")),
            to_text(row.get("veredicto_humano_AC")),
        ]
        if part
    )

    return {
        "pdf_id": to_int(row.get("pdf_id")),
        "pdf_nombre": display_pdf_name,
        "pdf_public_path": anon_public_path if anon_available else (f"public_pdfs/{to_text(row.get('pdf_nombre'))}" if pdf_path else ""),
        "pdf_available": anon_available or bool(pdf_path),
        "pdf_is_anonymized": anon_available,
        "revista": display_source,
        "pais": to_text(row.get("pais")),
        "macroarea": to_text(row.get("macroarea")),
        "anio": to_int(row.get("anio")),
        "titulo": display_title,
        "case_label": case_label,
        "search_text": search_text,
        "anonymization": anonymization,
        "ia": {
            "A": to_int(row.get("A_ia")),
            "B": to_int(row.get("B_ia")),
            "C": to_int(row.get("C_ia")),
            "clase_textual": to_text(row.get("clase_textual_ia")),
            "veredicto": to_text(row.get("veredicto_ia")),
            "veredicto_ac": to_text(row.get("veredicto_ia_AC")),
            "motivo": to_text(row.get("motivo_ia")),
            "confianza": to_num(row.get("confianza_ia")),
        },
        "referencia": {
            "aplicable": to_text(row.get("aplicable_humano")),
            "A": to_num(row.get("A_humano_muestreo_no_prob")),
            "B": to_num(row.get("B_humano_advierte_limites")),
            "C": to_num(row.get("C_humano_extrapola_infiere")),
            "veredicto_ac": to_text(row.get("veredicto_humano_AC")),
            "evidencia_muestreo": to_text(row.get("evidencia_muestreo_humano")),
            "evidencia_inferencia": to_text(row.get("evidencia_inferencia_humano")),
            "evidencia_extrapolacion": to_text(row.get("evidencia_extrapolacion_humano")),
            "pagina_o_seccion": to_text(row.get("pagina_o_seccion_evidencia")),
            "comentario": normalize_reference_text(row.get("comentario_humano_actual")),
            "fecha_revision": to_text(row.get("fecha_revision")),
            "acuerdo_ia_referencia_ac": to_text(row.get("acuerdo_ia_humano_AC")),
            "tipo_discrepancia": normalize_reference_text(row.get("tipo_discrepancia")),
            "accion_recomendada": normalize_reference_text(row.get("accion_recomendada")),
        },
    }


def copy_pdf(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and dst.stat().st_size == src.stat().st_size:
        return
    shutil.copy2(src, dst)


def build():
    rows = load_rows()
    anon_map = load_anonymized_map()

    OUTPUT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_PDF_DIR.mkdir(parents=True, exist_ok=True)

    records = []
    missing = []
    for row in rows:
        pdf_name = to_text(row.get("pdf_nombre"))
        src = find_pdf(pdf_name)
        if src is None:
            missing.append(pdf_name)
        else:
            copy_pdf(src, OUTPUT_PDF_DIR / pdf_name)
        records.append(record_from_row(row, src, anon_map.get(pdf_name)))

    verdict_counts = Counter(r["ia"]["veredicto"] for r in records)
    reference_counts = Counter(r["referencia"]["veredicto_ac"] for r in records if r["referencia"]["veredicto_ac"])
    country_counts = Counter(r["pais"] for r in records)
    area_counts = Counter(r["macroarea"] for r in records)

    payload = {
        "meta": {
            "title": "Fallas de Generalizacion Inferencial en Estudios Cuantitativos Sudamericanos",
            "record_count": len(records),
            "pdf_available_count": sum(1 for r in records if r["pdf_available"]),
            "missing_pdfs": missing,
            "source_note": "Catalogo publico derivado de la tabla maestra interna de referencia vs IA y alineado con el manuscrito final sometido a DADOS.",
        },
        "stats": {
            "ia_verdict_counts": verdict_counts,
            "reference_verdict_counts": reference_counts,
            "country_counts": country_counts,
            "macroarea_counts": area_counts,
            "reference_metrics": ARTICLE_REFERENCE_METRICS,
        },
        "records": records,
    }

    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"records={len(records)} pdfs={payload['meta']['pdf_available_count']} missing={len(missing)}")


if __name__ == "__main__":
    build()
