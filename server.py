#!/usr/bin/env python3
"""Flask + SQLite 真实后端 —— 静态文件托管 + API 路由

启动: python server.py
端口: http://localhost:8000

API 路由:
  GET  /api/stats        → {totalVisits, uniqueVisitors, todayVisits}
  GET  /api/captcha      → {captchaId, svg}
  POST /api/visit        → {uuid, nickname} (幂等)
  GET  /api/visits       → [{id, uuid, nickname, ip, created_at}] 管理页
"""
import os
import sqlite3
import uuid
import random
import string
import datetime
import io
from flask import Flask, request, jsonify, send_from_directory

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'visits.db')
PORT = 8080

app = Flask(__name__, static_folder=None)

# ── 数据库 ──────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT UNIQUE NOT NULL,
            nickname TEXT DEFAULT '',
            ip TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# ── 中间件: 禁缓存头 ──────────────────────────────────────────────
@app.after_request
def add_no_cache(response):
    # 静态文件和 API 都禁缓存(开发期)
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# ── 静态文件托管 ──────────────────────────────────────────────────
@app.route('/')
@app.route('/galaxy.html')
@app.route('/index.html')
@app.route('/admin.html')
def serve_index(path=''):
    fname = path if path else 'galaxy.html'
    return send_from_directory(BASE_DIR, fname)

@app.route('/<path:path>')
def serve_static(path):
    # API 路由已在上方捕获,这里兜底
    return send_from_directory(BASE_DIR, path)

# ── API 路由 ──────────────────────────────────────────────────────
@app.route('/api/stats', methods=['GET'])
def api_stats():
    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM visits')
    total = cur.fetchone()[0]
    cur.execute('SELECT COUNT(DISTINCT uuid) FROM visits')
    unique = cur.fetchone()[0]
    today = datetime.datetime.now().strftime('%Y-%m-%d')
    cur.execute("SELECT COUNT(*) FROM visits WHERE created_at LIKE ?", (f'{today}%',))
    today_count = cur.fetchone()[0]
    conn.close()
    return jsonify({
        'totalVisits': total,
        'uniqueVisitors': unique,
        'todayVisits': today_count
    })

@app.route('/api/captcha', methods=['GET'])
def api_captcha():
    # 生成简单图形验证码 —— 4 字符随机 + SVG
    chars = string.ascii_uppercase + string.digits
    code = ''.join(random.choices(chars, k=4))
    captcha_id = uuid.uuid4().hex[:16]
    # 简单 SVG,带扭曲线条
    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">',
        '<rect width="120" height="40" fill="#1a1a1a"/>',
    ]
    for i, ch in enumerate(code):
        x = 15 + i * 25 + random.randint(-3, 3)
        y = 28 + random.randint(-3, 3)
        rot = random.randint(-25, 25)
        color = f'rgb({random.randint(180,255)},{random.randint(150,220)},{random.randint(80,180)})'
        svg_parts.append(
            f'<text x="{x}" y="{y}" font-size="22" fill="{color}" '
            f'font-family="monospace" transform="rotate({rot} {x} {y})">{ch}</text>'
        )
    for _ in range(3):
        x1, y1 = random.randint(0, 120), random.randint(0, 40)
        x2, y2 = random.randint(0, 120), random.randint(0, 40)
        svg_parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#333" stroke-width="1"/>')
    svg_parts.append('</svg>')
    svg = ''.join(svg_parts)
    # 存到临时 dict(单进程够用,比赛现场不用 Redis)
    if not hasattr(app, '_captchas'):
        app._captchas = {}
    app._captchas[captcha_id] = {'code': code, 'expires': datetime.datetime.now() + datetime.timedelta(minutes=5)}
    # 清理过期
    now = datetime.datetime.now()
    app._captchas = {k: v for k, v in app._captchas.items() if v['expires'] > now}
    return jsonify({'captchaId': captcha_id, 'svg': svg})

@app.route('/api/visit', methods=['POST'])
def api_visit():
    data = request.get_json(silent=True) or {}
    # 兼容两种命名:前端 main.js 用 visitUuid/captchaAnswer,也接受 uuid/captcha
    visit_uuid = data.get('visitUuid') or data.get('uuid', '')
    nickname = data.get('nickname', '')
    captcha_id = data.get('captchaId', '')
    captcha_answer = data.get('captchaAnswer') or data.get('captcha', '')

    if not visit_uuid:
        return jsonify({'error': 'uuid 缺失'}), 400

    # 验证码校验(如果前端传了)
    if captcha_id and captcha_answer:
        cap_store = getattr(app, '_captchas', {})
        cap = cap_store.get(captcha_id)
        if not cap:
            return jsonify({'error': '验证码已过期,请刷新'}), 400
        if cap['code'].upper() != captcha_answer.upper():
            return jsonify({'error': '验证码错误'}), 400
        cap_store.pop(captcha_id, None)  # 用后即焚

    ip = request.remote_addr or '127.0.0.1'
    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id FROM visits WHERE uuid = ?', (visit_uuid,))
    if cur.fetchone():
        conn.close()
        return jsonify({'success': True, 'idempotent': True})
    cur.execute(
        'INSERT INTO visits (uuid, nickname, ip) VALUES (?, ?, ?)',
        (visit_uuid, nickname[:50], ip)
    )
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/visits', methods=['GET'])
def api_visits():
    limit = min(int(request.args.get('limit', 100)), 500)
    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT id, uuid, nickname, ip, created_at FROM visits ORDER BY id DESC LIMIT ?', (limit,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)

# ── 启动 ──────────────────────────────────────────────────────────
if __name__ == '__main__':
    print(f'✨ Flask + SQLite server running on http://localhost:{PORT}')
    print(f'   DB: {DB_PATH}')
    app.run(host='0.0.0.0', port=PORT, debug=False)
