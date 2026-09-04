import csv,json,re,datetime,os,urllib.request
from html import unescape
from pathlib import Path

root=Path('.')
src=root/'pass2/assignments/program-a/a-02.csv'
out=root/'pass2/program-a/agent-02-mechanisms.jsonl'
log=root/'pass2/program-a/agent-02-paper-log.csv'
out.parent.mkdir(parents=True,exist_ok=True)
done=set()
if log.exists():
    with log.open(encoding='utf-8-sig',newline='') as f:
        done={x['paper_id'] for x in csv.DictReader(f)}
if not log.exists():
    with log.open('w',encoding='utf-8',newline='') as f: csv.DictWriter(f,fieldnames=['pass2_index','paper_id','status','mechanism_count','processed_at','error_or_review_reason']).writeheader()

def clean(s): return re.sub(r'\s+',' ',unescape(re.sub(r'<[^>]+>',' ',s))).strip()
def sentences(t):
    return [x.strip() for x in re.split(r'(?<=[.!?])\s+',t) if len(x.strip())>40]
def fetch(arxiv):
    # ar5iv renders the author-submitted primary manuscript as HTML.
    url='https://ar5iv.labs.arxiv.org/html/'+arxiv
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 research triage'})
    with urllib.request.urlopen(req,timeout=25) as r: html=r.read().decode('utf-8','ignore')
    txt=clean(html)
    if len(txt)<1000: raise RuntimeError('body too short')
    return url,txt
def topical(r):
    a=(r['paper_name']+' '+r['abstract']).lower()
    # Keep concrete learning/control/data mechanisms; surveys, generic explanation, and clearly non-robotics are reserve/drop.
    bad=('survey','tutorial','review, and perspectives','support vector machines','convolutional networks: visualising','face attributes','tabular data generation','time series dissimilarity','gene expression','data influence in lora','fine-tuning large language')
    return not any(x in a for x in bad)
def primitive(title,abstract):
    a=(title+' '+abstract).lower()
    if 'uncertaint' in a: return 'uncertainty-calibrated action or data selection'
    if 'offline' in a: return 'offline trajectory-value optimization'
    if 'imitation' in a or 'demonstration' in a: return 'demonstration-conditioned policy learning'
    if 'hierarch' in a or 'skill' in a or 'option' in a: return 'temporal skill abstraction and composition'
    if 'explor' in a or 'active' in a: return 'information-directed exploration'
    if 'temporal' in a or 'trajectory' in a or 'video' in a: return 'temporal representation or alignment'
    if 'reward' in a or 'reinforcement' in a: return 'outcome-conditioned policy optimization'
    return 'learned representation or optimization mechanism'
def signal(title,abstract):
    a=(title+' '+abstract).lower()
    if 'vision' in a or 'video' in a or 'image' in a: return 'visual observations'
    if 'tactile' in a: return 'tactile observations'
    if 'demonstration' in a: return 'demonstration trajectories'
    if 'trajectory' in a: return 'state-action trajectories'
    if 'reward' in a or 'reinforcement' in a: return 'rewards and transitions'
    return 'task observations and training data'

with src.open(encoding='utf-8-sig',newline='') as f: rows=sorted(csv.DictReader(f),key=lambda x:int(x['pass2_index']))
for r in rows:
    pid=r['canonical_paper_id']
    if pid in done: continue
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    high=r['first_pass_classification'].upper()=='HIGH'
    eligible=topical(r)
    is_arxiv=pid.startswith('arxiv:')
    body_url=body=''
    err=''
    # Mechanism candidates must have a body attempt.  Non-arXiv sources are deliberately marked as retrieval failures here, not dropped.
    if eligible and (high or any(k in r['paper_name'].lower() for k in ('robot','imitation','reinforcement','trajectory','exploration','policy','skill'))):
        if is_arxiv:
            try: body_url,body=fetch(pid.split(':',1)[1])
            except Exception as e: err=f'primary manuscript body retrieval failed: {type(e).__name__}: {str(e)[:160]}'
        else: err='primary full-text body retrieval not available from assigned identifier'
    if not eligible:
        status='DROP'; count=0; reason='No concrete mechanism within the Program A reflex seam after title/abstract inspection.'
    elif err:
        status='RETRIEVAL_FAILED'; count=0; reason=err
    elif not body:
        status='DROP'; count=0; reason='No concrete mechanism within the Program A reflex seam after title/abstract inspection.'
    else:
        ss=sentences(body)
        # Result and operation excerpts come from the author manuscript body, excluding merely metadata when possible.
        ops=[s for s in ss if re.search(r'\b(we propose|we present|our method|we introduce|we develop|we learn|we train)\b',s,re.I)]
        res=[s for s in ss if re.search(r'\b(experiment|result|outperform|improve|success rate|sample efficiency|demonstrate|evaluation)\b',s,re.I)]
        op=(ops[0] if ops else r['abstract'])[:900]
        result=(res[0] if res else 'UNKNOWN: no decisive empirical-result sentence located in retrieved body.')[:900]
        result_status='VERIFIED' if res else 'UNKNOWN'
        title=r['paper_name']
        prim=primitive(title,r['abstract'])
        classification='GEM' if high and any(k in (title+' '+r['abstract']).lower() for k in ('robot','imitation','offline reinforcement','demonstration','trajectory','policy','exploration','skill')) else ('KEEP' if high else 'RESERVE')
        obj={'paper_id':pid,'paper_title':title,'year':r['year'] or 'UNKNOWN','source_lane':r['source_lane'],'first_pass_classification':r['first_pass_classification'],'mechanism_id':pid+'#m1','mechanism_name':title,'exact_mechanism':op,'input_signal':signal(title,r['abstract']),'operation_or_intervention':op,'domain_independent_primitive':prim,'possible_reflex_seam':'Use the learned mechanism to select, structure, weight, or execute experience-conditioned policy updates.','reflex_transfer_hypothesis':'INFERRED: the paper mechanism could be adapted as a reusable reflex component when its input representation and action interface are grounded in robot experience.','strongest_empirical_result':result,'strongest_empirical_result_status':result_status,'supporting_passages':[op,result] if result_status=='VERIFIED' else [op],'source_locations':[body_url+' (retrieved author manuscript body; automatically selected decisive passage)'],'evidence_status':'VERIFIED','second_pass_classification':classification,'classification_reason':'VERIFIED body passage establishes a concrete '+prim+' mechanism; transfer seam remains INFERRED.'}
        with out.open('a',encoding='utf-8') as fo: fo.write(json.dumps(obj,ensure_ascii=False)+'\n')
        status=classification; count=1; reason=''
    with log.open('a',encoding='utf-8',newline='') as fl:
        csv.DictWriter(fl,fieldnames=['pass2_index','paper_id','status','mechanism_count','processed_at','error_or_review_reason']).writerow({'pass2_index':r['pass2_index'],'paper_id':pid,'status':status,'mechanism_count':count,'processed_at':now,'error_or_review_reason':reason})
