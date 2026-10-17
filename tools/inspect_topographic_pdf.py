#!/usr/bin/env python3
"""Inspect real NL topographic map PDFs to determine vector-path extraction potential.

This is a non-destructive, single-sheet experiment, NOT a road extractor.
"""
import argparse
import json
from collections import Counter
from pathlib import Path

import fitz
import requests


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--url", default="https://www.gov.nl.ca/landuseatlas/documents/topo/50000/012B09.pdf")
    ap.add_argument("--output", type=Path, required=True)
    args=ap.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    if not args.url.startswith("https://www.gov.nl.ca/landuseatlas/documents/topo/50000/"):
        raise ValueError("Inspection restricted to official provincial topographic PDFs")
    response=requests.get(args.url,timeout=(20,90),headers={"User-Agent":"NL-Map-Data-Research/1.0"})
    response.raise_for_status()
    if not response.content.startswith(b"%PDF"):
        raise ValueError("Remote source is not PDF")
    pdf=fitz.open(stream=response.content,filetype="pdf")
    pages=[]
    for i,page in enumerate(pdf):
        shapes=page.get_cdrawings()
        color_counts=Counter()
        line_count=0
        fill_count=0
        for path in shapes:
            if path.get("color") is not None:
                color=path["color"]
                color_counts[str(tuple(round(float(v),2) for v in color))]+=1
                line_count+=1
            if path.get("fill") is not None:
                fill_count+=1
        images=len(page.get_images(full=True))
        text_items=len(page.get_text("blocks"))
        pages.append({"page_index":i,"dimensions_points":list(page.rect),
            "vector_drawing_paths":len(shapes),"stroked_paths":line_count,
            "filled_paths":fill_count,"embedded_image_objects":images,
            "text_blocks":text_items,"top_vector_stroke_colors":color_counts.most_common(15)})
        if i==0:
            # Thumbnail for human comparison. Keep preview small and safe on hosted runner.
            w=min(1300,page.rect.width)
            factor=w/page.rect.width
            pix=page.get_pixmap(matrix=fitz.Matrix(factor,factor),alpha=False)
            pix.save(str(args.output/"topographic-pdf-preview.png"))
    report={"url":args.url,"bytes":len(response.content),"pages":pages,
        "document_metadata":pdf.metadata,
        "interpretation":"Vector paths, if present, are PDF drawing commands, not yet attributed GIS road segments. Precise georeferencing and road-class separation are mandatory before use."}
    (args.output/"topographic_pdf_inspection.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2))
    pdf.close()


if __name__=="__main__":
    main()
