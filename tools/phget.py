import json, subprocess, os, sys
ASSETS = {'shrub_02':'2k','shrub_01':'2k','planter_box_01':'1k','street_lamp_01':'1k','tree_small_02':'1k'}
for a,res in ASSETS.items():
    d = json.loads(subprocess.run(['curl','-s','--max-time','30',f'https://api.polyhaven.com/files/{a}'],capture_output=True,text=True).stdout)
    g = d['gltf'][res]['gltf']
    dest = f'/home/lex/chargebay/assets/ph/{a}'
    os.makedirs(dest, exist_ok=True)
    # main file
    main_url = g['url']; main_name = os.path.basename(main_url)
    subprocess.run(['curl','-sL','--max-time','120','-o',f'{dest}/{main_name}',main_url])
    for rel,info in g.get('include',{}).items():
        p = f'{dest}/{rel}'
        os.makedirs(os.path.dirname(p), exist_ok=True)
        subprocess.run(['curl','-sL','--max-time','300','-o',p,info['url']])
    print(a, 'done', os.listdir(dest))
