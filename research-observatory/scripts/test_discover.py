import importlib.util,json,os,shutil,sys,tempfile
spec=importlib.util.spec_from_file_location("d","scripts/discover_research.py");d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
assert d.norm_doi("https://doi.org/10.1038/NRN.2016.44")=="10.1038/nrn.2016.44" and d.norm_doi("not a doi") is None
good=dict(doi="10.1234/x",title="T",date="2026-09",authors=["A"],retracted=False);assert d.valid(good)
assert not d.valid({**good,"authors":[]}) and not d.valid({**good,"retracted":True}) and not d.valid({**good,"date":"Sept"}) and not d.valid({**good,"doi":"x"})
assert d.classify("Machine consciousness and language models")==["machine","ai","consciousness"] or "machine" in d.classify("Machine consciousness and language models")
assert d.classify("Soil chemistry") is None
tmp=tempfile.mkdtemp();shutil.copytree("data",tmp+"/data");os.environ["OBS_DATA"]=tmp+"/data"
spec.loader.exec_module(d);before=open(tmp+"/data/publications.json").read()
def boom(*a,**k): raise OSError("offline")
d.get=boom;rc=d.main();assert rc==1 and open(tmp+"/data/publications.json").read()==before,"failed update must not change dataset"
st=json.load(open(tmp+"/data/status.json"));assert st["lastSuccessfulUpdate"] is None
fake=[dict(doi="10.1038/nrn.2016.44",title="dup",date="2016-05-26",authors=["x"],type="article",source="s",publisher="p",retracted=False,provider="OpenAlex"),
      dict(doi="10.9999/new.1",title="Machine consciousness test",date="2026-10-01",authors=["Real Author"],type="article",source="J",publisher="P",retracted=False,provider="OpenAlex"),
      dict(doi="10.9999/ret.1",title="Retracted",date="2026-10-01",authors=["R"],type="article",source="J",publisher="P",retracted=True,provider="OpenAlex"),
      dict(doi="10.9999/noauth",title="No authors",date="2026-10-01",authors=[],type="article",source="J",publisher="P",retracted=False,provider="OpenAlex")]
d.openalex=lambda q,s:[dict(r) for r in fake];d.crossref_verify=lambda doi:"ok";d.time.sleep=lambda s:None
d.QUERIES={"machine":["q"]};rc=d.main();items=json.load(open(tmp+"/data/publications.json"))["items"]
dois=[p["doi"] for p in items];assert rc==0 and dois.count("10.1038/nrn.2016.44")==1 and "10.9999/new.1" in dois and "10.9999/ret.1" not in dois and "10.9999/noauth" not in dois
assert len(items)==19 and all(p.get("seed") for p in items[:18]);print("all discovery tests passed")
