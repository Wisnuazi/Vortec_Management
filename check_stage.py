import json

with open(r'C:\Users\mzamu\AppData\Local\Temp\projects.json') as f:
    d = json.load(f)
p = d[0]
print('Project:', p['name'])
print()
print('Documents (stage):')
for doc in p['documents']:
    print(f"  {doc['name']:25} {doc.get('stage', 'NONE')}")
print()
print('Tasks (stage):')
for t in p['tasks'][:10]:
    print(f"  {t['title'][:35]:35} {t.get('stage', 'NONE')}")
print(f"  ... ({len(p['tasks'])} total)")
