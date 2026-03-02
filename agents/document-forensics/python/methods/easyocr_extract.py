"""EasyOCR field extraction + classification script.

Called as a subprocess by the TypeScript EasyOCR extractor.
Usage: python -m methods.easyocr_extract <image_path> [languages]
"""
import sys
import json
import warnings
warnings.filterwarnings("ignore")

def main():
    img_path = sys.argv[1]
    langs = sys.argv[2].split(',') if len(sys.argv) > 2 else ['vi', 'en']

    import easyocr
    reader = easyocr.Reader(langs, verbose=False)
    results = reader.readtext(img_path)

    raw_items = []
    for (bbox_pts, text, confidence) in results:
        if not text.strip():
            continue
        xs = [p[0] for p in bbox_pts]
        ys = [p[1] for p in bbox_pts]
        raw_items.append({
            "text_raw": text.strip(),
            "confidence": round(float(confidence), 4),
            "box": [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))],
        })

    print(json.dumps(raw_items, ensure_ascii=False))

if __name__ == "__main__":
    main()
