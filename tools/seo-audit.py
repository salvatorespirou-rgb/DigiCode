"""Audit published HTML sources without treating private pages as SEO failures."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, unquote
import json, sys, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'.git', '.claude', '.vscode', 'node_modules', 'remodel', 'concepts', 'email-templates', 'seo-reports'}

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ''; self.in_title = False; self.h1 = 0; self.lang = ''
        self.meta = {}; self.canonicals = []; self.refs = []; self.missing_alt = 0
        self.schemas = []; self.schema_text = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'html': self.lang = a.get('lang', '')
        if tag == 'title': self.in_title = True
        if tag == 'h1': self.h1 += 1
        if tag == 'meta': self.meta[a.get('name', a.get('property', ''))] = a.get('content', '')
        if tag == 'link' and a.get('rel') == 'canonical': self.canonicals.append(a.get('href', ''))
        if tag == 'img' and 'alt' not in a: self.missing_alt += 1
        if tag == 'script' and a.get('type') == 'application/ld+json': self.schema_text = ''
        for key in ('src', 'href'):
            if a.get(key): self.refs.append(a[key])
    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if tag == 'script' and self.schema_text is not None:
            try: self.schemas.append(json.loads(self.schema_text))
            except ValueError: self.schemas.append({'invalid': True})
            self.schema_text = None
    def handle_data(self, data):
        if self.in_title: self.title += data
        if self.schema_text is not None: self.schema_text += data

def run():
    records = []
    for file in sorted(ROOT.rglob('*.html')):
        rel = file.relative_to(ROOT)
        if EXCLUDED.intersection(rel.parts) or file.name in {'card-preview.html', 'google1419eef9ac915169.html'}: continue
        p = Page(); p.feed(file.read_text(encoding='utf-8-sig'))
        broken = []
        for ref in p.refs:
            u = urlparse(ref)
            if u.scheme or u.netloc or not u.path: continue
            target = (ROOT / unquote(u.path).lstrip('/')) if u.path.startswith('/') else (file.parent / unquote(u.path))
            if not any(x.is_file() for x in [target, Path(str(target)+'.html'), target/'index.html']): broken.append(ref)
        records.append({'file': rel.as_posix(), 'indexable': 'noindex' not in p.meta.get('robots',''),
            'title': p.title, 'description': p.meta.get('description',''), 'canonical':p.canonicals,
            'lang':p.lang,'h1':p.h1,'missing_alt':p.missing_alt,'broken_local_refs':sorted(set(broken)),
            'invalid_schema':any(s.get('invalid') for s in p.schemas if isinstance(s,dict)), 'schema_count':len(p.schemas)})
    urls = [e.text for e in ET.parse(ROOT/'sitemap.xml').iter('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
    canonical_pages = {r['canonical'][0]:r for r in records if len(r['canonical'])==1}
    sitemap_issues = [u for u in urls if u not in canonical_pages or not canonical_pages[u]['indexable']]
    issues=[]
    for r in records:
        for key in ('title','description','lang'):
            if not r[key]: issues.append(f"{r['file']}: missing {key}")
        if r['h1'] != 1: issues.append(f"{r['file']}: expected one H1, found {r['h1']}")
        if r['indexable'] and (len(r['canonical'])!=1 or not r['canonical'][0].startswith('https://www.digi-code.com.au/')): issues.append(f"{r['file']}: invalid canonical")
        if r['missing_alt'] or r['broken_local_refs'] or r['invalid_schema']: issues.append(f"{r['file']}: asset, link or schema issue")
    output={'pages_checked':len(records),'indexable_pages':sum(r['indexable'] for r in records),'sitemap_urls':len(urls),'issues':issues,'sitemap_issues':sitemap_issues,'pages':records}
    dest=ROOT/'seo-reports';dest.mkdir(exist_ok=True)
    (dest/(sys.argv[1] if len(sys.argv)>1 else 'source-audit.json')).write_text(json.dumps(output,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in output.items() if k!='pages'},indent=2))
    return bool(issues or sitemap_issues)

if __name__ == '__main__': sys.exit(run())
