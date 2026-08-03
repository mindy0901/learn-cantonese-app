import json

d = json.load(open(r"d:\Code\learn-cantonese-app\backend\vocabularies.json", encoding="utf-8"))
out = []
for e in d:
    c = e.get("character") or ""
    if "安" in str(c):
        py = [(p.get("pinyin"), p.get("jyutping"), p.get("sino_vietnamese")) for p in (e.get("pronunciations") or [])]
        out.append(repr(e.get("character")) + " " + repr(py))
with open(r"C:\Users\milul\AppData\Local\Temp\an_out.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))
print("written", len(out))
