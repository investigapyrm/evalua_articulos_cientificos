#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import fitz


REPO_ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = REPO_ROOT / "public_pdfs"
OUTPUT_DIR = REPO_ROOT / "anonymized_pdfs"
MANIFEST_CSV = REPO_ROOT / "public_data" / "anonymized_pdf_manifest.csv"
MANIFEST_JSON = REPO_ROOT / "public_data" / "anonymized_pdf_manifest.json"
SOURCE_JSON = REPO_ROOT / "public_data" / "auditables_346.json"

ANCHOR_PATTERNS = [
    "abstract",
    "resumen",
    "summary",
    "introduccion",
    "introduction",
    "metodologia",
    "metodología",
    "metodos",
    "métodos",
    "methodology",
    "methods",
    "background",
    "objetivo",
    "objective",
    "presentacion del tema",
    "presentación del tema",
    "palabras clave",
    "keywords",
]

COVER_PATTERNS = [
    "como citar el articulo",
    "cómo citar el artículo",
    "numero completo",
    "número completo",
    "mas informacion del articulo",
    "más información del artículo",
    "pagina de la revista",
    "página de la revista",
    "redalyc.org",
    "sistema de informacion cientifica redalyc",
    "sistema de información científica redalyc",
]

PII_PATTERNS = [
    r"[\w.\-+%]+@[\w.\-]+\.[A-Za-z]{2,}",
    r"\borcid\b",
    r"\bdoi\b",
    r"https?://",
    r"\bwww\.",
    r"\bcorrespond",
    r"\bcorresponding author\b",
    r"\bcorrespondencia\b",
    r"\brecibido\b",
    r"\baccepted\b",
    r"\breceived\b",
    r"\bissn\b",
    r"\be-issn\b",
    r"\bhow to cite\b",
    r"\bc[oó]mo citar\b",
]

KEEP_LINE_PATTERNS = [
    "abstract",
    "resumen",
    "summary",
    "introduction",
    "introduccion",
    "introducción",
    "methods",
    "metodos",
    "métodos",
    "metodologia",
    "metodología",
    "presentacion del tema",
    "presentación del tema",
]

LETTER_RE = re.compile(r"[A-Za-zÀ-ÿ]")
PII_REGEXES = [re.compile(pat, re.IGNORECASE) for pat in PII_PATTERNS]


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower()
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def contains_any(text: str, patterns: list[str]) -> bool:
    low = normalize_text(text)
    return any(pat in low for pat in patterns)


def contains_pii(text: str) -> bool:
    return any(rx.search(text or "") for rx in PII_REGEXES)


def shrink_rect(rect: fitz.Rect, pad: float = 2.0) -> fitz.Rect:
    return fitz.Rect(rect.x0 - pad, rect.y0 - pad, rect.x1 + pad, rect.y1 + pad)


@dataclass
class Block:
    rect: fitz.Rect
    text: str


def get_blocks(page: fitz.Page) -> list[Block]:
    blocks = []
    for item in page.get_text("blocks"):
        x0, y0, x1, y1, text = item[:5]
        text = (text or "").strip()
        if not text:
            continue
        blocks.append(Block(rect=fitz.Rect(x0, y0, x1, y1), text=text))
    return blocks


def find_keyword_anchor(blocks: list[Block]) -> Block | None:
    for block in sorted(blocks, key=lambda b: (b.rect.y0, b.rect.x0)):
        if contains_any(block.text, ANCHOR_PATTERNS):
            return block
    return None


def recurring_header_footer_rects(doc: fitz.Document) -> dict[int, list[fitz.Rect]]:
    occurrences: dict[str, list[tuple[int, fitz.Rect]]] = defaultdict(list)
    for page_index in range(doc.page_count):
        page = doc[page_index]
        height = page.rect.height
        for block in get_blocks(page):
            if block.rect.y1 <= height * 0.14 or block.rect.y0 >= height * 0.90:
                key = normalize_text(block.text)
                if len(key) < 8 or not LETTER_RE.search(key):
                    continue
                occurrences[key].append((page_index, block.rect))

    result: dict[int, list[fitz.Rect]] = defaultdict(list)
    for key, items in occurrences.items():
        if len(items) < 2:
            continue
        for page_index, rect in items:
            result[page_index].append(shrink_rect(rect))
    return result


def page_needs_cover_swap(page: fitz.Page, blocks: list[Block], doc: fitz.Document) -> bool:
    if doc.page_count > 1:
        return True
    full_text = "\n".join(block.text for block in blocks)
    if contains_any(full_text, COVER_PATTERNS):
        return True
    return False


def first_page_redaction_rects(page: fitz.Page, blocks: list[Block]) -> tuple[list[fitz.Rect], str, dict[str, str]]:
    anchor = find_keyword_anchor(blocks)
    height = page.rect.height
    width = page.rect.width
    strategy = "first_page_block_redaction"
    details = {
        "anchor_found": "yes" if anchor else "no",
        "anchor_text": (anchor.text[:120].replace("\n", " ") if anchor else ""),
    }

    if anchor is None:
        cut_y = height * 0.55
        strategy = "first_page_fallback_band"
    else:
        cut_y = min(anchor.rect.y0 + 4, height * 0.72)

    rects = []
    for block in blocks:
        low = normalize_text(block.text)
        in_left_sidebar = block.rect.x1 <= width * 0.34 and block.rect.y0 <= height * 0.82
        is_footer_like = block.rect.y0 >= height * 0.88 and (
            contains_pii(block.text) or len(low.split()) <= 12 or "revista" in low or "journal" in low
        )
        if block.rect.y0 < cut_y or in_left_sidebar:
            rects.append(shrink_rect(block.rect))
            continue
        if contains_pii(block.text) or is_footer_like:
            rects.append(shrink_rect(block.rect))

        if height > 0:
            top_logo_band = fitz.Rect(0, 0, page.rect.width * 0.22, height * 0.18)
            rects.append(top_logo_band)
        if page.parent.page_count == 1:
            rects.append(fitz.Rect(0, height * 0.92, page.rect.width, height))

    return rects, strategy, details


def write_cover_page(page: fitz.Page, public_id: str, page_count: int):
    margin = 48
    y = 72
    width = page.rect.width - margin * 2
    body = (
        "Copia anonimizada para verificacion metodologica.\n\n"
        "Se removieron portada editorial, titulo, autores, afiliaciones, correos, DOI, URLs y metadatos del PDF original.\n"
        "Las paginas restantes conservan el contenido util para revisar metodos, resultados, tablas y conclusiones."
    )
    page.insert_textbox(
        fitz.Rect(margin, y, margin + width, y + 120),
        "PDF ANONIMIZADO",
        fontsize=22,
        fontname="helv",
        align=fitz.TEXT_ALIGN_LEFT,
        color=(0.07, 0.16, 0.28),
    )
    y += 44
    page.insert_textbox(
        fitz.Rect(margin, y, margin + width, y + 80),
        f"ID publico: {public_id}\nPaginas del documento: {page_count}",
        fontsize=13,
        fontname="helv",
        color=(0.15, 0.15, 0.15),
    )
    y += 74
    page.insert_textbox(
        fitz.Rect(margin, y, margin + width, y + 180),
        body,
        fontsize=12,
        fontname="helv",
        color=(0.2, 0.2, 0.2),
    )
    y += 170
    page.draw_rect(fitz.Rect(margin, y, margin + width, y + 2), fill=(0.12, 0.40, 0.74), color=None)
    y += 18
    page.insert_textbox(
        fitz.Rect(margin, y, margin + width, y + 140),
        "Nota: la anonimización automatica prioriza reducir la identificacion directa del articulo. "
        "Los casos de una sola pagina o diseno no convencional deben revisarse manualmente antes de una publicacion abierta.",
        fontsize=11,
        fontname="helv",
        color=(0.32, 0.32, 0.32),
    )


def dedupe_rects(rects: list[fitz.Rect]) -> list[fitz.Rect]:
    seen = set()
    out = []
    for rect in rects:
        key = tuple(round(v, 1) for v in (rect.x0, rect.y0, rect.x1, rect.y1))
        if key in seen:
            continue
        seen.add(key)
        out.append(rect)
    return out


def safe_apply_redactions(page: fitz.Page) -> bool:
    try:
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
        return False
    except Exception:
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
        return True


def load_id_map() -> dict[str, int]:
    if not SOURCE_JSON.exists():
        return {}
    payload = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    return {row["pdf_nombre"]: int(row["pdf_id"]) for row in payload.get("records", [])}


def anonymize_file(src: Path, dst: Path, public_id: str) -> dict[str, str | int]:
    src_doc = fitz.open(src)
    original_page_count = src_doc.page_count
    strategy = "first_page_block_redaction"
    strategy_notes = {}
    cover_swapped = False
    pii_hits = 0
    image_redaction_fallback = False

    if original_page_count > 1:
        strategy = "cover_swap_first_page"
        cover_swapped = True
        first_rect = src_doc[0].rect
        doc = fitz.open()
        cover = doc.new_page(width=first_rect.width, height=first_rect.height)
        write_cover_page(cover, public_id=public_id, page_count=original_page_count)
        doc.insert_pdf(src_doc, from_page=1, to_page=original_page_count - 1)
    else:
        doc = fitz.open(src)

    page_rects = recurring_header_footer_rects(doc)
    repeat_hits = sum(len(rects) for rects in page_rects.values())

    start_page = 1 if cover_swapped else 0
    for page_index in range(start_page, doc.page_count):
        page = doc[page_index]
        blocks = get_blocks(page)
        rects = list(page_rects.get(page_index, []))
        if cover_swapped:
            rects.append(fitz.Rect(0, 0, page.rect.width, page.rect.height * 0.13))
            rects.append(fitz.Rect(0, 0, page.rect.width * 0.25, page.rect.height * 0.18))
            rects.append(fitz.Rect(0, page.rect.height * 0.92, page.rect.width, page.rect.height))

        for block in blocks:
            if contains_pii(block.text):
                rects.append(shrink_rect(block.rect))
                pii_hits += 1

        if page_index == 0 and not cover_swapped:
            first_rects, strategy, strategy_notes = first_page_redaction_rects(page, blocks)
            rects.extend(first_rects)

        rects = dedupe_rects(rects)
        for rect in rects:
            page.add_redact_annot(rect, fill=(1, 1, 1))
        if rects:
            image_redaction_fallback = safe_apply_redactions(page) or image_redaction_fallback

    doc.set_metadata({})
    dst.parent.mkdir(parents=True, exist_ok=True)
    doc.save(dst, garbage=4, deflate=True, clean=True)
    doc.close()
    src_doc.close()

    flags = []
    if original_page_count == 1:
        flags.append("single_page")
    if cover_swapped:
        flags.append("cover_swapped")
    if strategy_notes.get("anchor_found") == "no" and not cover_swapped:
        flags.append("no_anchor")
    if pii_hits == 0:
        flags.append("no_explicit_pii_match")
    if image_redaction_fallback:
        flags.append("image_redaction_fallback")

    return {
        "public_id": public_id,
        "page_count": original_page_count,
        "strategy": strategy,
        "pii_block_hits": pii_hits,
        "recurring_header_footer_hits": repeat_hits,
        "flags": ";".join(flags),
        "anchor_found": strategy_notes.get("anchor_found", ""),
        "anchor_text": strategy_notes.get("anchor_text", ""),
    }


def render_public_name(pdf_id: int | None, original_name: str, ordinal: int) -> str:
    if pdf_id is not None:
        return f"case_{pdf_id:04d}.pdf"
    return f"case_fallback_{ordinal:04d}.pdf"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Genera copias anonimizada de los PDFs publicos.")
    parser.add_argument("--input-dir", type=Path, default=INPUT_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--manifest-csv", type=Path, default=MANIFEST_CSV)
    parser.add_argument("--manifest-json", type=Path, default=MANIFEST_JSON)
    parser.add_argument("--limit", type=int, default=0, help="Procesa solo N archivos para pruebas.")
    parser.add_argument("--match", default="", help="Procesa solo archivos cuyo nombre contenga esta cadena.")
    return parser


def main():
    args = build_parser().parse_args()
    id_map = load_id_map()
    files = sorted(args.input_dir.glob("*.pdf"))
    if args.match:
        files = [path for path in files if args.match.lower() in path.name.lower()]
    if args.limit:
        files = files[: args.limit]

    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.manifest_csv.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    stats = Counter()
    for ordinal, src in enumerate(files, start=1):
        pdf_id = id_map.get(src.name)
        public_name = render_public_name(pdf_id, src.name, ordinal)
        public_id = public_name.replace(".pdf", "")
        dst = args.output_dir / public_name
        result = anonymize_file(src, dst, public_id=public_id)
        row = {
            "original_name": src.name,
            "public_name": public_name,
            "public_path": str(dst.relative_to(REPO_ROOT)),
            "pdf_id": pdf_id if pdf_id is not None else "",
            **result,
        }
        rows.append(row)
        stats[result["strategy"]] += 1

    with args.manifest_csv.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "original_name",
                "public_name",
                "public_path",
                "pdf_id",
                "public_id",
                "page_count",
                "strategy",
                "pii_block_hits",
                "recurring_header_footer_hits",
                "flags",
                "anchor_found",
                "anchor_text",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    args.manifest_json.write_text(
        json.dumps(
            {
                "meta": {
                    "input_dir": str(args.input_dir.relative_to(REPO_ROOT)),
                    "output_dir": str(args.output_dir.relative_to(REPO_ROOT)),
                    "file_count": len(rows),
                    "strategy_counts": stats,
                },
                "rows": rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"processed={len(rows)} output_dir={args.output_dir}")
    for strategy, count in sorted(stats.items()):
        print(f"{strategy}={count}")


if __name__ == "__main__":
    main()
