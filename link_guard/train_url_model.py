# train_url_model.py
import re
import math
import json
import numpy as np
import pandas as pd
from collections import Counter
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
from urllib.parse import urlparse, parse_qs

# ---------- utilities ----------
def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    cnt = Counter(s)
    probs = [v/len(s) for v in cnt.values()]
    ent = -sum(p * math.log2(p) for p in probs)
    return ent

SUSPICIOUS_KEYWORDS = ['login','secure','account','verify','update','bank','confirm','password','signin','pay','verify','credit','card','secure-login']

SUSPICIOUS_TLDS = set(['cn','ru','xyz','club','top','info','pw','icu','zip','loan','cam','click','link'])  # expand as needed

ipv4_re = re.compile(r'^\d{1,3}(\.\d{1,3}){3}$')

# ---------- feature extractor ----------
def extract_features(url: str):
    try:
        u = url if '://' in url else 'http://' + url
        p = urlparse(u)
    except Exception:
        p = urlparse('http://'+url)

    hostname = p.hostname or ''
    pathname = p.path or ''
    query = p.query or ''

    len_url = len(url)
    len_hostname = len(hostname)
    # number of subdomains (count parts minus 2 for domain+TLD); clamp >=0
    parts = hostname.split('.')
    num_subdomains = max(0, len(parts) - 2) if hostname and len(parts) >= 2 else 0
    has_ip = 1 if ipv4_re.match(hostname) else 0
    punycode = 1 if hostname.lower().startswith('xn--') else 0
    uses_http = 1 if p.scheme == 'http' else 0
    query_len = len(query)
    num_params = len(parse_qs(query))
    path_len = len(pathname)
    count_digits = sum(c.isdigit() for c in url)
    count_hyphens = hostname.count('-')
    susp_keyword_count = sum(1 for k in SUSPICIOUS_KEYWORDS if k in url.lower())
    entropy_path = shannon_entropy(pathname)
    tld = (parts[-1].lower() if len(parts) >= 1 else '')
    tld_suspicious = 1 if tld in SUSPICIOUS_TLDS else 0

    feats = [
        len_url,
        len_hostname,
        num_subdomains,
        has_ip,
        punycode,
        uses_http,
        query_len,
        num_params,
        path_len,
        count_digits,
        count_hyphens,
        susp_keyword_count,
        entropy_path,
        tld_suspicious
    ]
    return feats

FEATURE_NAMES = [
    'len_url','len_hostname','num_subdomains','has_ip','punycode','uses_http',
    'query_len','num_params','path_len','count_digits','count_hyphens',
    'susp_keyword_count','entropy_path','tld_suspicious'
]

# ---------- load datasets ----------
# You must prepare two CSVs or a combined CSV with columns: url,label (1=phish,0=benign)
# Example small CSV for testing:
# data = pd.read_csv('urls_labeled.csv')  # columns: url,label

# For demonstration we'll create a tiny synthetic dataset (replace with real data)
def make_synthetic():
    pos = [
        'http://login-secure.example-login.xyz/verify?u=1',
        'http://meta-support-passwordid.pages.dev/',
        'http://bank.verify-login.ru/confirm',
        'http://192.168.1.2/secure',
    ]
    neg = [
        'https://www.google.com/',
        'https://github.com/',
        'https://en.wikipedia.org/wiki/Main_Page',
        'https://openphish.com/'
    ]
    rows = []
    for u in pos:
        rows.append((u, 1))
    for u in neg:
        rows.append((u, 0))
    return pd.DataFrame(rows, columns=['url','label'])

def load_data(path=None):
    if path:
        df = pd.read_csv(path)
    else:
        df = make_synthetic()
    return df

# ---------- build dataset ----------
df = load_data(None)  # replace None with 'your_labeled_urls.csv' for real training
X = np.array([extract_features(u) for u in df['url']])
y = df['label'].values

# optional: scale / standardize numeric features — logistic with liblinear is OK without heavy scaling
# but if you want better coefficients, standardize. We'll compute means/stds to export to JS.
means = X.mean(axis=0)
stds = X.std(axis=0, ddof=0)
stds_fixed = np.where(stds == 0, 1.0, stds)  # avoid divide-by-zero

Xs = (X - means) / stds_fixed

# split
X_train, X_test, y_train, y_test = train_test_split(Xs, y, test_size=0.25, random_state=42, stratify=y if len(set(y))>1 else None)

# train logistic regression
model = LogisticRegression(solver='liblinear')
model.fit(X_train, y_train)

# evaluate
y_pred = model.predict(X_test)
y_prob = model.predict_proba(X_test)[:,1] if hasattr(model, "predict_proba") else model.decision_function(X_test)
print("Classification report:\n", classification_report(y_test, y_pred))
try:
    auc = roc_auc_score(y_test, y_prob)
    print("ROC AUC:", auc)
except Exception:
    pass

# export model: coefficients, intercept, feature order, scaler means/stds
export = {
    "feature_names": FEATURE_NAMES,
    "coef": model.coef_.tolist()[0],
    "intercept": float(model.intercept_[0]),
    "scaler": {
        "means": means.tolist(),
        "stds": stds_fixed.tolist()
    },
    "note": "Logistic regression weights trained on demo/synthetic data. Retrain with real dataset."
}

with open('model.json', 'w') as f:
    json.dump(export, f, indent=2)

print("Saved model.json")
