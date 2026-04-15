#!/usr/bin/env python3
"""
TypeForge Pro v2 — Flask + fonttools Backend
全功能字体编辑 API 服务
"""

import os, sys, io, json, copy, tempfile, traceback, uuid, time, logging
from pathlib import Path
from functools import wraps
from collections import OrderedDict

from flask import Flask, request, jsonify, send_file, send_from_directory, Response
from flask_cors import CORS

from fontTools.ttLib import TTFont
from fontTools.misc.arrayTools import calcBounds
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.subset import Subsetter, Options as SubsetterOptions

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ─── Debug Mode ──────────────────────────────────────────────────────
DEBUG = os.environ.get('TYPEFORGE_DEBUG', '1') == '1'

logger = logging.getLogger('typeforge')
logger.setLevel(logging.DEBUG if DEBUG else logging.INFO)
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(message)s', datefmt='%H:%M:%S'))
logger.addHandler(handler)

def dbg(msg, *args):
    if DEBUG:
        logger.debug(msg, *args)

def log_info(msg, *args):
    logger.info(msg, *args)

log_info("TypeForge Pro v2 — Debug mode: %s", "ON" if DEBUG else "OFF")

# ─── Glyph SVG Cache ─────────────────────────────────────────────────
class LRUCache:
    """Simple LRU cache for glyph SVG data."""
    def __init__(self, max_size=500):
        self._cache = OrderedDict()
        self._max = max_size
        self.hits = 0
        self.misses = 0

    def get(self, key):
        if key in self._cache:
            self._cache.move_to_end(key)
            self.hits += 1
            return self._cache[key]
        self.misses += 1
        return None

    def put(self, key, value):
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = value
        while len(self._cache) > self._max:
            self._cache.popitem(last=False)

    def invalidate(self, prefix=None):
        if prefix is None:
            self._cache.clear()
        else:
            keys_to_del = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_del:
                del self._cache[k]

    def stats(self):
        total = self.hits + self.misses
        ratio = self.hits / total if total > 0 else 0
        return {'size': len(self._cache), 'max': self._max, 'hits': self.hits, 'misses': self.misses, 'ratio': f'{ratio:.1%}'}

glyph_cache = LRUCache(500)

# ─── Session storage ────────────────────────────────────────────────
FONTS_DIR = tempfile.mkdtemp(prefix="typeforge_")
fonts = {}  # session_id → { path, font, original_path, modified }

def get_font(session_id):
    if session_id not in fonts:
        return None
    return fonts[session_id]

def save_font(session_id):
    """Save current TTFont to disk, return path."""
    info = get_font(session_id)
    if not info:
        return None
    path = os.path.join(FONTS_DIR, f"{session_id}.ttf")
    info['font'].save(path)
    info['path'] = path
    return path

# ─── Helpers ────────────────────────────────────────────────────────

def safe_int(v, default=0):
    try: return int(v)
    except: return default

def safe_float(v, default=0.0):
    try: return float(v)
    except: return default

def table_to_dict(font, tag):
    """Convert a font table to a JSON-serializable dict."""
    tbl = font.get(tag)
    if tbl is None:
        return None
    
    # Use TTX XML round-trip for complex tables
    from fontTools.misc.xmlWriter import XMLWriter
    buf = io.StringIO()
    writer = XMLWriter(buf)
    tbl.toXML(writer, font)
    return buf.getvalue()

def glyph_to_svg(font, glyph_name, em_size=1000):
    """Convert a glyph to SVG path data (with cache)."""
    cache_key = f"{id(font)}:{glyph_name}"
    cached = glyph_cache.get(cache_key)
    if cached:
        dbg("Cache hit: %s", glyph_name)
        return cached
    
    dbg("Generating SVG for: %s", glyph_name)
    t0 = time.time()
    
    glyf = font.get("glyf")
    if glyf is None:
        return None
    
    try:
        glyph = glyf[glyph_name]
    except KeyError:
        dbg("Glyph not found in glyf: %s", glyph_name)
        return None
    
    if glyph is None:
        dbg("Glyph is None: %s", glyph_name)
        return None
    
    # 对于空字形（无轮廓），返回空路径和基本bounds
    has_outline = hasattr(glyph, 'numberOfContours') and glyph.numberOfContours is not None and glyph.numberOfContours != 0
    
    # 从hmtx获取advanceWidth
    hmtx = font.get('hmtx')
    aw = 0
    if hmtx and glyph_name in hmtx.metrics:
        aw = hmtx.metrics[glyph_name][0]
    
    if not has_outline and not (hasattr(glyph, 'isComposite') and glyph.isComposite()):
        # 空字形（space, .notdef等）
        result = {
            'path': '',
            'bounds': [0, 0, aw, 0] if aw > 0 else [0, 0, 0, 0],
            'advanceWidth': aw,
        }
        glyph_cache.put(cache_key, result)
        return result
    
    try:
        pen = SVGPathPen(font.getGlyphSet())
        glyph.draw(pen, glyfTable=glyf)
        path_data = pen.getCommands()
    except Exception as e:
        dbg("SVG path generation failed for %s: %s", glyph_name, e)
        result = {
            'path': '',
            'bounds': [0, 0, aw, 0] if aw > 0 else [0, 0, 0, 0],
            'advanceWidth': aw,
        }
        glyph_cache.put(cache_key, result)
        return result
    
    # Calculate bounds from glyph
    if hasattr(glyph, 'xMin') and glyph.xMin is not None:
        bounds = (glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax)
    else:
        bounds = (0, -200, 500, 800)
    
    result = {
        'path': path_data,
        'bounds': list(bounds) if bounds else None,
        'advanceWidth': aw,
    }
    
    glyph_cache.put(cache_key, result)
    dbg("SVG generated: %s (%.1fms)", glyph_name, (time.time() - t0) * 1000)
    return result

def serialize_otl_lookup(lookup):
    """Serialize an OTL lookup to a JSON-friendly structure."""
    result = {
        'type': lookup.LookupType,
        'flag': lookup.LookupFlag,
        'subtables': []
    }
    
    lt = lookup.LookupType
    
    for i, subtable in enumerate(lookup.SubTable):
        st = {'index': i}
        
        if lt == 1:  # SingleSubst
            st['type'] = 'SingleSubst'
            if hasattr(subtable, 'mapping'):
                st['mapping'] = {k: v for k, v in subtable.mapping.items()}
        
        elif lt == 2:  # MultipleSubst
            st['type'] = 'MultipleSubst'
            if hasattr(subtable, 'mapping'):
                st['mapping'] = {k: list(v) for k, v in subtable.mapping.items()}
        
        elif lt == 3:  # AlternateSubst
            st['type'] = 'AlternateSubst'
            if hasattr(subtable, 'alternates'):
                st['alternates'] = {k: list(v) for k, v in subtable.alternates.items()}
        
        elif lt == 4:  # LigatureSubst
            st['type'] = 'LigatureSubst'
            if hasattr(subtable, 'ligatures'):
                ligs = {}
                for first, lig_list in subtable.ligatures.items():
                    ligs[first] = []
                    for lig in lig_list:
                        ligs[first].append({
                            'glyph': lig.LigGlyph,
                            'components': list(lig.Component) if hasattr(lig, 'Component') else []
                        })
                st['ligatures'] = ligs
        
        elif lt == 5:  # ContextSubst
            st['type'] = 'ContextSubst'
            st['raw'] = '(Context substitution - complex structure)'
        
        elif lt == 6:  # ChainContextSubst
            st['type'] = 'ChainContextSubst'
            st['raw'] = '(Chained context substitution - complex structure)'
        
        elif lt == 8:  # ReverseChainSingleSubst
            st['type'] = 'ReverseChainSingleSubst'
            st['raw'] = '(Reverse chained context substitution)'
        
        elif lt == 1 and str(lookup.getTableTag()) == 'GPOS':  # SinglePos
            st['type'] = 'SinglePos'
        
        elif lt == 2 and str(lookup.getTableTag()) == 'GPOS':  # PairPos
            st['type'] = 'PairPos'
        
        result['subtables'].append(st)
    
    return result

def serialize_otl_table(font, tag):
    """Serialize GPOS or GSUB table to JSON structure."""
    tbl = font.get(tag)
    if tbl is None:
        return None
    
    result = {
        'tag': tag,
        'scripts': [],
        'features': [],
        'lookups': []
    }
    
    if not hasattr(tbl, 'table') or tbl.table is None:
        return result
    
    tt = tbl.table
    
    # Scripts
    if tt.ScriptList:
        for srec in tt.ScriptList.ScriptRecord:
            script = {
                'tag': srec.ScriptTag,
                'defaultLangSys': None,
                'langSys': []
            }
            if srec.Script.DefaultLangSys:
                dls = srec.Script.DefaultLangSys
                script['defaultLangSys'] = {
                    'reqFeatureIndex': dls.ReqFeatureIndex if hasattr(dls, 'ReqFeatureIndex') else 0xFFFF,
                    'featureIndices': list(dls.FeatureIndex) if hasattr(dls, 'FeatureIndex') else []
                }
            if srec.Script.LangSysRecord:
                for lrec in srec.Script.LangSysRecord:
                    ls = lrec.LangSys
                    script['langSys'].append({
                        'tag': lrec.LangSysTag,
                        'reqFeatureIndex': ls.ReqFeatureIndex if hasattr(ls, 'ReqFeatureIndex') else 0xFFFF,
                        'featureIndices': list(ls.FeatureIndex) if hasattr(ls, 'FeatureIndex') else []
                    })
            result['scripts'].append(script)
    
    # Features
    if tt.FeatureList:
        for frec in tt.FeatureList.FeatureRecord:
            feature = {
                'tag': frec.FeatureTag,
                'lookups': list(frec.Feature.LookupListIndex) if hasattr(frec.Feature, 'LookupListIndex') else []
            }
            result['features'].append(feature)
    
    # Lookups
    if tt.LookupList:
        for i, lookup in enumerate(tt.LookupList.Lookup):
            lk = serialize_otl_lookup(lookup)
            lk['index'] = i
            result['lookups'].append(lk)
    
    return result


# ═══════════════════════════════════════════════════════════════════
# API ROUTES
# ═══════════════════════════════════════════════════════════════════

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('css', filename)

@app.route('/js/<path:filename>')
def serve_js(filename):
    from flask import Response
    content = (Path('js') / filename).read_bytes()
    mime = 'application/javascript' if filename.endswith('.js') else 'text/plain'
    return Response(content, mimetype=mime)

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'fonttools': True, 'debug': DEBUG, 'cache': glyph_cache.stats()})

@app.route('/api/cache/stats', methods=['GET'])
def cache_stats():
    return jsonify(glyph_cache.stats())

@app.route('/api/cache/clear', methods=['POST'])
def cache_clear():
    prefix = request.args.get('prefix')
    glyph_cache.invalidate(prefix)
    log_info("Cache cleared (prefix=%s)", prefix)
    return jsonify({'ok': True, 'stats': glyph_cache.stats()})

# ─── Platform / Language name lookup ──────────────────────────────

PLATFORM_NAMES = {
    0: 'Unicode',
    1: 'Macintosh',
    2: 'ISO',
    3: 'Windows',
    4: 'Custom',
}

MAC_LANG_NAMES = {
    0: '英语', 11: '马耳他语', 12: '希腊语', 13: '土耳其语', 14: '乌克兰语',
    15: '塞尔维亚语', 16: '克罗地亚语', 17: '罗马尼亚语', 18: '冰岛语',
    19: '阿拉伯语', 20: '希伯来语', 21: '马耳他语', 24: '泰语',
    25: '朝鲜语/韩语', 27: '拉脱维亚语', 28: '立陶宛语', 30: '越南语',
    33: '简体中文', 34: '繁体中文', 35: '日语',
    36: '韩语', 37: '亚美尼亚语', 38: '格鲁吉亚语',
}

WIN_LANG_NAMES = {
    0x0401: '阿拉伯语(沙特)', 0x0402: '保加利亚语', 0x0403: '加泰罗尼亚语',
    0x0404: '繁体中文(台湾)', 0x0405: '捷克语', 0x0406: '丹麦语',
    0x0407: '德语(德国)', 0x0408: '希腊语', 0x0409: '英语(美国)',
    0x040A: '西班牙语(传统)', 0x040B: '芬兰语', 0x040C: '法语(法国)',
    0x040D: '希伯来语', 0x040E: '匈牙利语', 0x040F: '冰岛语',
    0x0410: '意大利语(意大利)', 0x0411: '日语', 0x0412: '韩语',
    0x0413: '荷兰语(荷兰)', 0x0414: '挪威语(书面)', 0x0415: '波兰语',
    0x0416: '葡萄牙语(巴西)', 0x0418: '罗马尼亚语', 0x0419: '俄语',
    0x041A: '克罗地亚语', 0x041B: '斯洛伐克语', 0x041D: '瑞典语',
    0x041E: '泰语', 0x041F: '土耳其语', 0x0420: '乌尔都语',
    0x0421: '印尼语', 0x0424: '斯洛文尼亚语', 0x0425: '爱沙尼亚语',
    0x0426: '拉脱维亚语', 0x0427: '立陶宛语', 0x0429: '波斯语',
    0x042A: '越南语', 0x042D: '巴斯克语', 0x042F: '马其顿语',
    0x0436: '南非语', 0x0437: '格鲁吉亚语', 0x0438: '法罗语',
    0x0439: '印地语', 0x043E: '马来语(马来西亚)', 0x043F: '哈萨克语',
    0x0440: '吉尔吉斯语', 0x0441: '斯瓦希里语', 0x0443: '乌兹别克语(拉丁)',
    0x0444: '鞑靼语', 0x0446: '旁遮普语', 0x0447: '古吉拉特语',
    0x0449: '泰米尔语', 0x044A: '泰卢固语', 0x044B: '卡纳达语',
    0x044E: '马拉地语', 0x044F: '梵语', 0x0450: '蒙古语(西里尔)',
    0x0452: '威尔士语', 0x0456: '加利西亚语', 0x0457: '贡根语',
    0x0461: '尼泊尔语', 0x0465: '迪维希语', 0x046B: '克丘亚语',
    0x0480: '维吾尔语', 0x0804: '简体中文(中国)', 0x0807: '德语(瑞士)',
    0x0809: '英语(英国)', 0x080A: '西班牙语(墨西哥)', 0x080C: '法语(比利时)',
    0x0810: '意大利语(瑞士)', 0x0813: '荷兰语(比利时)',
    0x0816: '葡萄牙语(葡萄牙)', 0x081A: '塞尔维亚语(拉丁)',
    0x081D: '瑞典语(芬兰)', 0x0C04: '繁体中文(香港)',
    0x0C07: '德语(奥地利)', 0x0C09: '英语(澳大利亚)',
    0x0C0A: '西班牙语(现代)', 0x0C0C: '法语(加拿大)',
    0x1004: '简体中文(新加坡)', 0x1007: '德语(卢森堡)',
    0x1009: '英语(加拿大)', 0x100A: '西班牙语(危地马拉)',
    0x100C: '法语(瑞士)', 0x1404: '繁体中文(澳门)',
    0x1407: '德语(列支敦士登)', 0x1409: '英语(新西兰)',
    0x140A: '西班牙语(哥斯达黎加)', 0x140C: '法语(卢森堡)',
    0x1809: '英语(爱尔兰)', 0x180A: '西班牙语(巴拿马)',
    0x180C: '法语(摩纳哥)', 0x1C09: '英语(南非)',
    0x1C0A: '西班牙语(多米尼加)', 0x2009: '英语(牙买加)',
    0x200A: '西班牙语(委内瑞拉)', 0x2409: '英语(加勒比)',
    0x240A: '西班牙语(哥伦比亚)', 0x2809: '英语(伯利兹)',
    0x280A: '西班牙语(秘鲁)', 0x2C09: '英语(特立尼达)',
    0x2C0A: '西班牙语(阿根廷)', 0x3009: '英语(津巴布韦)',
    0x300A: '西班牙语(厄瓜多尔)', 0x340A: '西班牙语(智利)',
    0x380A: '西班牙语(乌拉圭)', 0x3C0A: '西班牙语(巴拉圭)',
    0x400A: '西班牙语(玻利维亚)', 0x440A: '西班牙语(萨尔瓦多)',
    0x480A: '西班牙语(洪都拉斯)', 0x4C0A: '西班牙语(尼加拉瓜)',
    0x500A: '西班牙语(波多黎各)',
}

OT_FEATURE_NAMES = {
    'aalt': '替代字形访问', 'abvf': '上方标记形式', 'abvm': '上方标记定位',
    'abvs': '上方替代', 'afrc': '竖式分数', 'akhn': 'Akhands',
    'blwf': '下方标记形式', 'blwm': '下方标记定位', 'blws': '下方替代',
    'calt': '上下文替代', 'case': '大小写敏感形式', 'ccmp': '字形组合/分解',
    'cfar': '连字回退替代', 'cjct': 'Conjunct Forms', 'clig': '上下文连字',
    'cpsp': '大写间距', 'cswh': '上下文Swash', 'curs': 'Cursive定位',
    'cv01': '特性变体1', 'cv02': '特性变体2', 'cv03': '特性变体3',
    'dist': '距离', 'dlig': '自由连字', 'dnom': '分母', 'dtls': 'Dotless Forms',
    'expt': 'Expert Forms', 'falt': '最终替代字形', 'fin2': 'Terminal Form #2',
    'fin3': 'Terminal Form #3', 'fina': '词尾形式', 'flac': 'Flattened Accents',
    'frac': '分数', 'fwid': '全宽', 'half': 'Half Forms', 'haln': 'Halant Forms',
    'halt': 'Alternate Half Width', 'hist': 'Historical Forms', 'hkna': 'Horizontal Kana Alternates',
    'hlig': '历史连字', 'hngl': 'Hangul', 'hojo': 'Hojo Kanji Forms',
    'hwid': '半宽', 'init': '词首形式', 'isol': '独立形式', 'ital': '意大利体替代',
    'jalt': 'Justification Alternatives', 'jp78': 'JIS78 Forms', 'jp83': 'JIS83 Forms',
    'jp90': 'JIS90 Forms', 'jp04': 'JIS2004 Forms', 'kern': '字距调整',
    'lfbd': 'Left Bounds', 'liga': '标准连字', 'ljmo': 'Leading Jamo Forms',
    'lnum': ' lining数字', 'locl': '本地化形式', 'ltra': 'Left-to-right alternates',
    'ltro': 'Left-to-right mirrored', 'mark': '标记定位', 'med2': 'Medial Form #2',
    'medi': '词中形式', 'mgrk': 'Mathematical Greek', 'mkmk': '标记间定位',
    'mset': 'Mark Positioning via Substitution', 'nalt': 'Alternative Annotation',
    'nlck': 'NLC Kanji Forms', 'nukt': 'Nukta Forms', 'numr': '分子',
    'onum': 'oldstyle数字', 'opbd': 'Optical Bounds', 'ordn': '序数形式',
    'ornm': '装饰符号', 'palt': 'Proportional Alternate Width', 'pcap': 'Petite大写',
    'pkna': 'Proportional Kana', 'pnum': '比例数字', 'pref': 'Pre-base Forms',
    'pres': 'Pre-base Substitutions', 'pstf': 'Post-base Forms',
    'psts': 'Post-base Substitutions', 'pwid': 'Proportional Width',
    'qwid': 'Quarter Widths', 'rand': '随机替代', 'rclt': 'Required Contextual Alternates',
    'rkrf': 'Rakar Forms', 'rlig': '必要连字', 'rphf': 'Reph Form',
    'rtbd': 'Right Bounds', 'rtla': 'Right-to-left alternates',
    'rtlm': 'Right-to-left mirrored', 'ruby': 'Ruby注释', 'rvrn': 'Required Variation Alternates',
    'salt': '风格替代', 'sinf': '科学下标', 'size': '光学尺寸',
    'smcp': '小型大写', 'smpl': 'Simplified Forms', 'ss01': '风格集1',
    'ss02': '风格集2', 'ss03': '风格集3', 'ss04': '风格集4',
    'ss05': '风格集5', 'ss06': '风格集6', 'ss07': '风格集7',
    'ss08': '风格集8', 'ss09': '风格集9', 'ss10': '风格集10',
    'ss11': '风格集11', 'ss12': '风格集12', 'ss13': '风格集13',
    'ss14': '风格集14', 'ss15': '风格集15', 'ss16': '风格集16',
    'ss17': '风格集17', 'ss18': '风格集18', 'ss19': '风格集19',
    'ss20': '风格集20', 'ssty': 'Script Style', 'stch': 'Stretching Glyph Decomposition',
    'subs': '下标', 'sups': '上标', 'swsh': 'Swash', 'titl': '标题形式',
    'tjmo': 'Trailing Jamo Forms', 'tnam': 'Traditional Name Forms',
    'tnum': '等宽数字', 'trad': '繁体形式', 'twid': 'Third Widths',
    'unic': 'Unicase', 'valt': 'Alternate Vertical Metrics',
    'vatu': 'Vattu Variants', 'vert': '竖排替代', 'vhal': 'Alternate Vertical Half Metrics',
    'vjmo': 'Vowel Jamo Forms', 'vkna': 'Vertical Kana Alternates',
    'vkrn': '竖排字距', 'vpal': 'Proportional Alternate Vertical Metrics',
    'vrt2': '竖排旋转替代', 'vrtr': 'Vertical Alternates for Rotation',
    'zero': '斜杠零',
}

OTL_SCRIPT_NAMES = {
    'DFLT': '默认', 'arab': '阿拉伯文', 'armn': '亚美尼亚文',
    'beng': '孟加拉文', 'bopo': '注音符号', 'cyrl': '西里尔文',
    'deva': '天城文', 'geor': '格鲁吉亚文', 'grek': '希腊文',
    'gujr': '古吉拉特文', 'guru': '古尔穆基文', 'hang': '韩文',
    'hani': '汉字', 'hebr': '希伯来文', 'hira': '平假名',
    'kana': '片假名', 'khmr': '高棉文', 'laoo': '老挝文',
    'latn': '拉丁文', 'mlym': '马拉雅拉姆文', 'mymr': '缅甸文',
    'orya': '奥里亚文', 'sinh': '僧伽罗文', 'taml': '泰米尔文',
    'telu': '泰卢固文', 'thaa': '塔安那文', 'thai': '泰文',
    'tibt': '藏文', 'yi  ': '彝文',
}

METRIC_DESCRIPTIONS = {
    # hhea
    'ascent': '基线到最高上升点距离（通常为正数）',
    'descent': '基线到最低下降点距离（通常为负数）',
    'lineGap': '行间间距，两行之间的额外空间',
    'advanceWidthMax': '所有字形中最大的前进宽度',
    'minLeftSideBearing': '所有字形中最小的左侧边距',
    'minRightSideBearing': '所有字形中最小的右侧边距',
    'xMaxExtent': 'maxX + minLeftSideBearing 的最大值',
    'caretSlopeRise': '插入符斜率的上升分量',
    'caretSlopeRun': '插入符斜率的水平分量',
    'caretOffset': '插入符偏移量',
    'reserved0': '保留字段', 'reserved1': '保留字段',
    'reserved2': '保留字段', 'reserved3': '保留字段',
    'metricDataFormat': '度量数据格式（通常为0）',
    'numberOfHMetrics': '水平度量表中的记录数',
    # OS/2
    'xAvgCharWidth': '平均字符宽度',
    'usWeightClass': '字重分类（100=极细 400=常规 700=粗 900=极粗）',
    'usWidthClass': '字宽分类（1=极窄 5=常规 9=极宽）',
    'fsType': '字体嵌入许可标志',
    'ySubscriptXSize': '下标字形宽度',
    'ySubscriptYSize': '下标字形高度',
    'ySubscriptXOffset': '下标X偏移',
    'ySubscriptYOffset': '下标Y偏移',
    'ySuperscriptXSize': '上标字形宽度',
    'ySuperscriptYSize': '上标字形高度',
    'ySuperscriptXOffset': '上标X偏移',
    'ySuperscriptYOffset': '上标Y偏移',
    'yStrikeoutSize': '删除线粗细',
    'yStrikeoutPosition': '删除线位置',
    'sFamilyClass': '字族分类',
    'panose': 'PANOSE字族分类号',
    'ulUnicodeRange1': 'Unicode范围位标志1',
    'ulUnicodeRange2': 'Unicode范围位标志2',
    'ulUnicodeRange3': 'Unicode范围位标志3',
    'ulUnicodeRange4': 'Unicode范围位标志4',
    'achVendID': '厂商标识符',
    'fsSelection': '字体选择标志（位组合）',
    'usFirstCharIndex': '首个字符Unicode索引',
    'usLastCharIndex': '末尾字符Unicode索引',
    'sTypoAscender': '排版上升线（建议用此值代替ascent）',
    'sTypoDescender': '排版下降线（建议用此值代替descent）',
    'sTypoLineGap': '排版行距',
    'usWinAscent': 'Windows上升线',
    'usWinDescent': 'Windows下降线',
    'ulCodePageRange1': '代码页范围位标志1',
    'ulCodePageRange2': '代码页范围位标志2',
    'sxHeight': 'x字高（小写x顶部到基线距离）',
    'sCapHeight': '大写字母高度',
    'usDefaultChar': '默认字符Unicode',
    'usBreakChar': '断字字符Unicode',
    'usMaxContext': '最大上下文长度',
    # head
    'version': '表版本号',
    'fontRevision': '字体修订版本',
    'checkSumAdjustment': '校验和调整值',
    'magicNumber': '魔数（应为0x5F0F3CF5）',
    'flags': '字体标志位',
    'unitsPerEm': '每个em的单位数（关键值，通常1000或2048）',
    'created': '创建日期',
    'modified': '修改日期',
    'xMin': '所有字形的X最小值',
    'yMin': '所有字形的Y最小值',
    'xMax': '所有字形的X最大值',
    'yMax': '所有字形的Y最大值',
    'macStyle': 'Mac风格标志位',
    'lowestRecPPEM': '最低推荐像素/EM',
    'fontDirectionHint': '字体方向提示',
    'indexToLocFormat': '位置索引格式（0=短 1=长）',
    'glyphDataFormat': '字形数据格式',
    # post
    'formatType': 'PostScript名称映射格式版本',
    'italicAngle': '斜体角度（度数，负值=右倾）',
    'underlinePosition': '下划线位置（基线以下为负）',
    'underlineThickness': '下划线粗细',
    'isFixedPitch': '是否等宽字体（0=否 1=是）',
    'minMemType42': 'Type 42最小内存',
    'maxMemType42': 'Type 42最大内存',
    'minMemType1': 'Type 1最小内存',
    'maxMemType1': 'Type 1最大内存',
    # vhea
    'vertTypoAscender': '竖排上升线',
    'vertTypoDescender': '竖排下降线',
    'vertTypoLineGap': '竖排行距',
    'advanceHeightMax': '最大前进高度',
    'minTopSideBearing': '最小顶部边距',
    'minBottomSideBearing': '最小底部边距',
    'yMaxExtent': '竖排最大范围',
    'caretSlopeRise': '竖排插入符斜率上升',
    'caretSlopeRun': '竖排插入符斜率水平',
    'caretOffset': '竖排插入符偏移',
    'numberOfVMetrics': '垂直度量表记录数',
    'majorVersion': '主版本号',
    'minorVersion': '次版本号',
}

@app.route('/api/platform-info', methods=['GET'])
def platform_info():
    """Return platform names, language names, OT feature names, script names for UI display."""
    return jsonify({
        'platforms': PLATFORM_NAMES,
        'macLanguages': MAC_LANG_NAMES,
        'winLanguages': WIN_LANG_NAMES,
        'otFeatures': OT_FEATURE_NAMES,
        'otlScripts': OTL_SCRIPT_NAMES,
        'metricDescriptions': METRIC_DESCRIPTIONS,
    })

@app.route('/api/platform-name/<int:pid>', methods=['GET'])
def get_platform_name(pid):
    return jsonify({'id': pid, 'name': PLATFORM_NAMES.get(pid, f'未知({pid})')})

@app.route('/api/language-name/<int:pid>/<int:lid>', methods=['GET'])
def get_language_name(pid, lid):
    if pid == 3:
        name = WIN_LANG_NAMES.get(lid, f'0x{lid:04X}')
    elif pid == 1:
        name = MAC_LANG_NAMES.get(lid, f'0x{lid:04X}')
    else:
        name = f'0x{lid:04X}'
    return jsonify({'platformID': pid, 'langID': lid, 'name': name})

# ─── Font Upload / Download ─────────────────────────────────────────

@app.route('/api/upload', methods=['POST'])
def upload_font():
    """Upload a font file, return session_id and basic info."""
    t0 = time.time()
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    f = request.files['file']
    session_id = str(uuid.uuid4())[:8]
    log_info("Upload: %s → session %s", f.filename, session_id)
    
    # Save to temp
    ext = os.path.splitext(f.filename)[1].lower()
    temp_path = os.path.join(FONTS_DIR, f"{session_id}{ext}")
    f.save(temp_path)
    
    try:
        font = TTFont(temp_path)
    except Exception as e:
        os.unlink(temp_path)
        log_info("Upload FAILED: %s — %s", f.filename, str(e))
        return jsonify({'error': f'Cannot parse font: {str(e)}'}), 400
    
    fonts[session_id] = {
        'path': temp_path,
        'font': font,
        'original_name': f.filename,
    }
    
    # Invalidate cache for this session
    glyph_cache.invalidate()
    
    info = get_font_info(session_id)
    info['sessionId'] = session_id
    log_info("Upload OK: %s (%.1fs)", f.filename, time.time() - t0)
    return jsonify(info)

@app.route('/api/info/<session_id>', methods=['GET'])
def get_font_info_route(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    result = get_font_info(session_id)
    result['sessionId'] = session_id
    return jsonify(result)

def get_font_info(session_id):
    """Get comprehensive font information."""
    info = get_font(session_id)
    if not info:
        return {'error': 'Session not found'}
    
    font = info['font']
    result = {
        'filename': info.get('original_name', 'unknown'),
        'tables': [],
        'name': {},
        'metrics': {},
        'stats': {},
    }
    
    # Table list with checksums and sizes
    for tag in font.keys():
        tbl = font[tag]
        result['tables'].append({
            'tag': tag,
            'name': tag,  # could map to human names
        })
    
    # Name table
    name_table = font.get('name')
    if name_table:
        for record in name_table.names:
            nid = record.nameID
            val = record.toUnicode() if hasattr(record, 'toUnicode') else str(record)
            pid = record.platformID
            eid = record.platEncID
            lid = record.langID
            key = f"{nid}_{pid}_{eid}_{lid}"
            result['name'][key] = {
                'nameID': nid,
                'platformID': pid,
                'encodingID': eid,
                'langID': lid,
                'value': val,
            }
    
    # Metrics
    for tag in ['hhea', 'vhea', 'OS/2', 'head', 'post']:
        tbl = font.get(tag)
        if tbl:
            d = {}
            for attr in dir(tbl):
                if attr.startswith('_'):
                    continue
                try:
                    v = getattr(tbl, attr)
                except Exception:
                    continue
                if callable(v):
                    continue
                if isinstance(v, (int, float, bool, str)):
                    d[attr] = v
                elif isinstance(v, tuple) and all(isinstance(x, (int, float)) for x in v):
                    d[attr] = list(v)
            result['metrics'][tag] = d
    
    # Stats
    glyf = font.get('glyf')
    cmap = font.get('cmap')
    result['stats'] = {
        'numGlyphs': len(font.getGlyphOrder()) if font.getGlyphOrder() else 0,
        'numCmapEntries': sum(len(t.cmap) for t in cmap.tables) if cmap else 0,
        'hasGPOS': font.get('GPOS') is not None,
        'hasGSUB': font.get('GSUB') is not None,
        'hasGDEF': font.get('GDEF') is not None,
        'hasFvar': font.get('fvar') is not None,
    }
    
    return result

@app.route('/api/download/<session_id>', methods=['GET'])
def download_font(session_id):
    """Download the modified font with progress tracking."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    fmt = request.args.get('format', 'ttf').lower()
    font = info['font']
    
    log_info("Export: session=%s format=%s", session_id, fmt)
    t0 = time.time()
    
    # Save to temp
    path = save_font(session_id)
    if not path:
        return jsonify({'error': 'Cannot save font'}), 500
    
    basename = os.path.splitext(info.get('original_name', 'font'))[0]
    
    if fmt == 'woff':
        woff_path = os.path.join(FONTS_DIR, f"{session_id}.woff")
        font.flavor = 'woff'
        font.save(woff_path)
        font.flavor = None
        log_info("Export done: %s.woff (%.1fs)", basename, time.time() - t0)
        return send_file(woff_path, as_attachment=True, download_name=f"{basename}.woff")
    
    elif fmt == 'woff2':
        woff2_path = os.path.join(FONTS_DIR, f"{session_id}.woff2")
        font.flavor = 'woff2'
        font.save(woff2_path)
        font.flavor = None
        log_info("Export done: %s.woff2 (%.1fs)", basename, time.time() - t0)
        return send_file(woff2_path, as_attachment=True, download_name=f"{basename}.woff2")
    
    else:  # ttf
        log_info("Export done: %s.ttf (%.1fs)", basename, time.time() - t0)
        return send_file(path, as_attachment=True, download_name=f"{basename}.ttf")

# ─── Table Data ─────────────────────────────────────────────────────

@app.route('/api/tables/<session_id>', methods=['GET'])
def list_tables(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    font = info['font']
    tables = []
    for tag in sorted(font.keys()):
        tables.append({'tag': tag})
    return jsonify({'tables': tables})

@app.route('/api/table/<session_id>/<tag>', methods=['GET'])
def get_table_data(session_id, tag):
    """Get raw table data as TTX XML."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    font = info['font']
    tbl = font.get(tag)
    if tbl is None:
        return jsonify({'error': f'Table {tag} not found'}), 404
    
    from fontTools.misc.xmlWriter import XMLWriter
    buf = io.StringIO()
    writer = XMLWriter(buf)
    tbl.toXML(writer, font)
    return jsonify({'tag': tag, 'ttx': buf.getvalue()})

# ─── Name Table ─────────────────────────────────────────────────────

@app.route('/api/name/<session_id>', methods=['GET'])
def get_name_table(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    font = info['font']
    name = font.get('name')
    if not name:
        return jsonify({'records': []})
    
    records = []
    for rec in name.names:
        records.append({
            'nameID': rec.nameID,
            'platformID': rec.platformID,
            'encodingID': rec.platEncID,
            'langID': rec.langID,
            'value': rec.toUnicode() if hasattr(rec, 'toUnicode') else str(rec),
        })
    return jsonify({'records': records})

@app.route('/api/name/<session_id>', methods=['POST'])
def set_name_record(session_id):
    """Set or update a name record."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    font = info['font']
    name = font['name']
    
    nameID = data['nameID']
    platformID = data.get('platformID', 3)
    encodingID = data.get('encodingID', 1 if platformID == 3 else 0)
    langID = data.get('langID', 0x0409 if platformID == 3 else 0)
    value = data['value']
    
    name.setName(value, nameID, platformID, encodingID, langID)
    return jsonify({'ok': True})

@app.route('/api/name/<session_id>/batch-replace', methods=['POST'])
def batch_replace_name(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    find = data.get('find', '')
    replace = data.get('replace', '')
    if not find:
        return jsonify({'error': 'Empty find string'}), 400
    
    font = info['font']
    name = font['name']
    count = 0
    for rec in name.names:
        val = rec.toUnicode() if hasattr(rec, 'toUnicode') else ''
        if find in val:
            new_val = val.replace(find, replace)
            name.setName(new_val, rec.nameID, rec.platformID, rec.platEncID, rec.langID)
            count += 1
    
    return jsonify({'ok': True, 'replaced': count})

@app.route('/api/name/<session_id>/delete', methods=['POST'])
def delete_name_record(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    font = info['font']
    name = font['name']
    name.removeNames(
        data['nameID'],
        platformID=data.get('platformID'),
        langID=data.get('langID'),
    )
    return jsonify({'ok': True})

# ─── Metrics ────────────────────────────────────────────────────────

@app.route('/api/metrics/<session_id>', methods=['GET'])
def get_metrics(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    font = info['font']
    
    result = {}
    for tag in ['hhea', 'vhea', 'OS/2', 'head', 'post']:
        tbl = font.get(tag)
        if tbl:
            d = {}
            for attr in dir(tbl):
                if attr.startswith('_'):
                    continue
                try:
                    v = getattr(tbl, attr)
                except Exception:
                    continue
                if callable(v):
                    continue
                if isinstance(v, (int, float, bool)):
                    d[attr] = v
                elif isinstance(v, tuple) and all(isinstance(x, (int, float)) for x in v):
                    d[attr] = list(v)
            result[tag] = d
    
    return jsonify(result)

@app.route('/api/metrics/<session_id>/<tag>', methods=['POST'])
def set_metrics(session_id, tag):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    font = info['font']
    tbl = font.get(tag)
    if tbl is None:
        return jsonify({'error': f'Table {tag} not found'}), 404
    
    for key, value in data.items():
        if hasattr(tbl, key) and isinstance(getattr(tbl, key), (int, float)):
            try:
                setattr(tbl, key, int(value) if isinstance(getattr(tbl, key), int) else float(value))
            except:
                pass
    
    # Recalc font checksums
    font['head'].checkSumAdjustment = 0
    return jsonify({'ok': True})

@app.route('/api/metrics/<session_id>/scale', methods=['POST'])
def scale_metrics(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    scale = safe_float(data.get('scale', 100)) / 100.0
    font = info['font']
    
    # Scale hhea
    if font.get('hhea'):
        h = font['hhea']
        h.ascent = int(h.ascent * scale)
        h.descent = int(h.descent * scale)
        h.lineGap = int(h.lineGap * scale)
    
    # Scale OS/2
    if font.get('OS/2'):
        o = font['OS/2']
        for attr in ['sTypoAscender', 'sTypoDescender', 'sTypoLineGap',
                      'winAscent', 'winDescent', 'sxHeight', 'sCapHeight',
                      'ySubscriptXSize', 'ySubscriptYSize', 'ySubscriptXOffset', 'ySubscriptYOffset',
                      'ySuperscriptXSize', 'ySuperscriptYSize', 'ySuperscriptXOffset', 'ySuperscriptYOffset',
                      'yStrikeoutSize', 'yStrikeoutPosition']:
            if hasattr(o, attr):
                setattr(o, attr, int(getattr(o, attr) * scale))
    
    # Scale vhea
    if font.get('vhea'):
        v = font['vhea']
        v.vertTypoAscender = int(v.vertTypoAscender * scale)
        v.vertTypoDescender = int(v.vertTypoDescender * scale)
        v.vertTypoLineGap = int(v.vertTypoLineGap * scale)
    
    # Scale glyph advances
    if font.get('hmtx'):
        for rec in font['hmtx'].metrics.values():
            rec[0] = int(rec[0] * scale)
    
    return jsonify({'ok': True, 'scale': scale})

# ─── Cmap ───────────────────────────────────────────────────────────

@app.route('/api/cmap/<session_id>', methods=['GET'])
def get_cmap(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    font = info['font']
    cmap = font.get('cmap')
    if not cmap:
        return jsonify({'mappings': []})
    
    # Use best cmap subtable
    best = cmap.getBestCmap()
    mappings = []
    for code, name in sorted(best.items()):
        mappings.append({
            'unicode': code,
            'char': chr(code) if code < 0x110000 else '',
            'name': name,
        })
    
    return jsonify({'mappings': mappings, 'total': len(mappings)})

@app.route('/api/cmap/<session_id>/search', methods=['GET'])
def search_cmap(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    query = request.args.get('q', '').lower()
    font = info['font']
    cmap = font.get('cmap')
    if not cmap:
        return jsonify({'mappings': []})
    
    best = cmap.getBestCmap()
    mappings = []
    for code, name in sorted(best.items()):
        if query in f"{code:04X}".lower() or query in name.lower() or query in chr(code) if code < 0x110000 else False:
            mappings.append({
                'unicode': code,
                'char': chr(code) if code < 0x110000 else '',
                'name': name,
            })
    
    return jsonify({'mappings': mappings})

@app.route('/api/cmap/<session_id>', methods=['POST'])
def set_cmap_entry(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    font = info['font']
    cmap = font.get('cmap')
    if not cmap:
        return jsonify({'error': 'No cmap table'}), 400
    
    # Modify in all cmap subtables
    for table in cmap.tables:
        if hasattr(table, 'cmap'):
            code = data['unicode']
            glyph = data['glyph']
            table.cmap[code] = glyph
    
    return jsonify({'ok': True})

@app.route('/api/cmap/<session_id>/delete', methods=['POST'])
def delete_cmap_entry(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    font = info['font']
    cmap = font.get('cmap')
    if not cmap:
        return jsonify({'error': 'No cmap table'}), 400
    
    code = data['unicode']
    for table in cmap.tables:
        if hasattr(table, 'cmap') and code in table.cmap:
            del table.cmap[code]
    
    return jsonify({'ok': True})

# ─── Glyphs ─────────────────────────────────────────────────────────

@app.route('/api/glyphs/<session_id>', methods=['GET'])
def list_glyphs(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    font = info['font']
    
    glyph_order = font.getGlyphOrder()
    # 获取cmap的reverse映射
    cmap = font.get('cmap')
    reverse_cmap = {}
    if cmap:
        best = cmap.getBestCmap() if hasattr(cmap, 'getBestCmap') else {}
        reverse_cmap = {v: k for k, v in best.items()}
    
    glyphs = []
    for i, name in enumerate(glyph_order):
        code = reverse_cmap.get(name, None)
        glyphs.append({
            'index': i,
            'name': name,
            'unicode': code,
            'char': chr(code) if code and code < 0x110000 else None,
        })
    
    log_info("List glyphs: %d total", len(glyphs))
    return jsonify({'glyphs': glyphs, 'total': len(glyphs)})

@app.route('/api/glyphs-batch-svg/<session_id>', methods=['POST'])
def batch_glyph_svg(session_id):
    """Get SVG data for multiple glyphs at once (for thumbnail grid)."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json or {}
    names = data.get('names', [])
    if not names:
        return jsonify({'glyphs': {}})
    
    # Limit batch size
    names = names[:100]
    
    font = info['font']
    result = {}
    for name in names:
        svg_data = glyph_to_svg(font, name)
        if svg_data:
            result[name] = {
                'path': svg_data['path'],
                'bounds': svg_data['bounds'],
                'advanceWidth': svg_data['advanceWidth'],
            }
    
    return jsonify({'glyphs': result, 'cached': glyph_cache.stats()})

@app.route('/api/glyph/<session_id>/<glyph_name>', methods=['GET'])
def get_glyph(session_id, glyph_name):
    """Get comprehensive glyph data including all fonttools attributes."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    font = info['font']
    
    dbg("Get glyph: %s", glyph_name)
    glyf = font.get('glyf')
    if glyf is None:
        return jsonify({'error': 'No glyf table'}), 404
    
    try:
        glyph = glyf.get(glyph_name)
    except Exception:
        return jsonify({'error': f'Glyph {glyph_name} not found'}), 404
    
    if glyph is None:
        return jsonify({'error': f'Glyph {glyph_name} not found'}), 404
    
    # SVG outline
    svg_data = glyph_to_svg(font, glyph_name)
    
    # Metrics from hmtx
    hmtx = font.get('hmtx')
    lsb = 0
    aw = 0
    vmtx = font.get('vmtx')
    tsb = 0  # top side bearing
    ah = 0   # advance height
    if hmtx and glyph_name in hmtx.metrics:
        aw, lsb = hmtx.metrics[glyph_name]
    if vmtx and glyph_name in vmtx.metrics:
        ah, tsb = vmtx.metrics[glyph_name]
    
    # Check glyph type
    is_simple = hasattr(glyph, 'numberOfContours') and glyph.numberOfContours is not None and glyph.numberOfContours >= 0
    is_composite = hasattr(glyph, 'isComposite') and callable(glyph.isComposite) and glyph.isComposite()
    is_empty = hasattr(glyph, 'numberOfContours') and (glyph.numberOfContours == 0 or glyph.numberOfContours is None)
    
    # Build comprehensive result
    result = {
        'name': glyph_name,
        # Basic metrics
        'advanceWidth': aw,
        'leftSideBearing': lsb,
        'advanceHeight': ah,
        'topSideBearing': tsb,
        # Glyph type
        'numberOfContours': getattr(glyph, 'numberOfContours', 0) or 0,
        'isComposite': is_composite,
        'isSimple': is_simple,
        'isEmpty': is_empty,
        # SVG path for display
        'path': svg_data['path'] if svg_data else '',
        'bounds': svg_data['bounds'] if svg_data else None,
        # Complete bounds from glyf
        'xMin': getattr(glyph, 'xMin', 0),
        'yMin': getattr(glyph, 'yMin', 0),
        'xMax': getattr(glyph, 'xMax', 0),
        'yMax': getattr(glyph, 'yMax', 0),
        # Full fonttools attributes
        '_fonttools': {
            'type': type(glyph).__name__,
            'hasHinting': getattr(glyph, 'program', None) is not None,
            'programSize': len(glyph.program) if hasattr(glyph, 'program') and glyph.program else 0,
        }
    }
    
    # Simple glyph: get coordinates and flags
    if is_simple and not is_empty:
        try:
            coords, endPts, flags = glyph.getCoordinates(glyf)
            points = []
            for j, (x, y) in enumerate(coords):
                # Decode flag bits
                on_curve = bool(flags[j] & 0x01)
                x_short = bool(flags[j] & 0x02)
                y_short = bool(flags[j] & 0x04)
                x_same = bool(flags[j] & 0x10)
                y_same = bool(flags[j] & 0x20)
                
                points.append({
                    'x': int(x),
                    'y': int(y),
                    'onCurve': on_curve,
                    '_flags': {
                        'xShort': x_short,
                        'yShort': y_short,
                        'xSame': x_same,
                        'ySame': y_same,
                    }
                })
            
            result['points'] = points
            result['endPtsOfContours'] = list(endPts) if endPts else []
            result['_fonttools']['totalPoints'] = len(points)
            result['_fonttools']['totalContours'] = len(endPts) if endPts else 0
        except Exception as e:
            dbg("Failed to get coordinates for %s: %s", glyph_name, e)
    
    # Composite glyph: get components
    if is_composite:
        try:
            components = []
            comp_glyph = glyph
            while hasattr(comp_glyph, 'isComposite') and callable(comp_glyph.isComposite) and comp_glyph.isComposite():
                if hasattr(comp_glyph, 'glyphName'):
                    comp_info = {
                        'glyphName': comp_glyph.glyphName,
                        'x': getattr(comp_glyph, 'x', 0),
                        'y': getattr(comp_glyph, 'y', 0),
                        'flags': getattr(comp_glyph, 'flags', 0),
                    }
                    # Transform matrix info
                    if hasattr(comp_glyph, 'transform') and comp_glyph.transform:
                        t = comp_glyph.transform
                        comp_info['transform'] = {
                            'a': t.a, 'b': t.b, 'c': t.c, 'd': t.d
                        }
                    # Component flags
                    flags_val = comp_info['flags']
                    comp_info['_flags'] = {
                        'ARGS_ARE_XY_VALUES': bool(flags_val & 0x0002),
                        'ARG_1_AND_2_ARE_WORDS': bool(flags_val & 0x0001),
                        'WE_HAVE_A_SCALE': bool(flags_val & 0x0008),
                        'WE_HAVE_AN_X_AND_Y_SCALE': bool(flags_val & 0x0040),
                        'WE_HAVE_A_TWO_BY_TWO': bool(flags_val & 0x0080),
                        'USE_MY_METRICS': bool(flags_val & 0x0200),
                        'SCALED_COMPONENT_OFFSET': bool(flags_val & 0x0800),
                        'UNSCALED_COMPONENT_OFFSET': bool(flags_val & 0x1000),
                    }
                    components.append(comp_info)
                
                # Move to next component (composite glyphes are nested)
                if hasattr(comp_glyph, 'glyph'):
                    comp_glyph = comp_glyph.glyph
                else:
                    break
            
            result['components'] = components
            result['_fonttools']['componentCount'] = len(components)
        except Exception as e:
            dbg("Failed to get components for %s: %s", glyph_name, e)
            result['components'] = []
    
    return jsonify(result)

@app.route('/api/glyph/<session_id>/<glyph_name>/metrics', methods=['POST'])
def set_glyph_metrics(session_id, glyph_name):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    font = info['font']
    
    if 'advanceWidth' in data and font.get('hmtx'):
        if glyph_name in font['hmtx'].metrics:
            aw, lsb = font['hmtx'].metrics[glyph_name]
            font['hmtx'].metrics[glyph_name] = (data['advanceWidth'], lsb)
    
    if 'leftSideBearing' in data and font.get('glyf') and font.get('hmtx'):
        glyf = font['glyf']
        glyph = glyf.get(glyph_name)
        if glyph:
            if glyph_name in font['hmtx'].metrics:
                aw, _ = font['hmtx'].metrics[glyph_name]
                font['hmtx'].metrics[glyph_name] = (aw, data['leftSideBearing'])
    
    if 'advanceHeight' in data and font.get('vmtx'):
        if glyph_name in font['vmtx'].metrics:
            ah, tsb = font['vmtx'].metrics[glyph_name]
            font['vmtx'].metrics[glyph_name] = (data['advanceHeight'], tsb)
    
    # Update hhea advanceWidthMax
    if font.get('hhea'):
        font['hhea'].advanceWidthMax = max(
            m[0] for m in font['hmtx'].metrics.values()
        ) if font.get('hmtx') else 0
    
    return jsonify({'ok': True})


@app.route('/api/glyphs-batch-metrics/<session_id>', methods=['POST'])
def batch_set_glyph_metrics(session_id):
    """Batch update metrics for multiple glyphs at once."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    glyphs = data.get('glyphs', [])  # List of {name, advanceWidth?, leftSideBearing?}
    
    if not glyphs:
        return jsonify({'error': 'No glyphs specified'}), 400
    
    font = info['font']
    updated = []
    errors = []
    
    for item in glyphs:
        glyph_name = item.get('name')
        if not glyph_name:
            continue
        
        try:
            # Update advance width
            if 'advanceWidth' in item and font.get('hmtx'):
                if glyph_name in font['hmtx'].metrics:
                    _, lsb = font['hmtx'].metrics[glyph_name]
                    font['hmtx'].metrics[glyph_name] = (item['advanceWidth'], lsb)
                    updated.append(glyph_name)
            
            # Update left side bearing
            if 'leftSideBearing' in item and font.get('hmtx'):
                if glyph_name in font['hmtx'].metrics:
                    aw, _ = font['hmtx'].metrics[glyph_name]
                    font['hmtx'].metrics[glyph_name] = (aw, item['leftSideBearing'])
                    if glyph_name not in updated:
                        updated.append(glyph_name)
            
            # Update advance height
            if 'advanceHeight' in item and font.get('vmtx'):
                if glyph_name in font['vmtx'].metrics:
                    _, tsb = font['vmtx'].metrics[glyph_name]
                    font['vmtx'].metrics[glyph_name] = (item['advanceHeight'], tsb)
                    if glyph_name not in updated:
                        updated.append(glyph_name)
                        
        except Exception as e:
            errors.append({'glyph': glyph_name, 'error': str(e)})
    
    # Update hhea advanceWidthMax
    if font.get('hhea') and font.get('hmtx'):
        font['hhea'].advanceWidthMax = max(m[0] for m in font['hmtx'].metrics.values())
    
    # Invalidate cache
    glyph_cache.invalidate()
    
    return jsonify({
        'ok': True,
        'updated': updated,
        'updatedCount': len(updated),
        'errors': errors
    })

@app.route('/api/glyph/<session_id>/<glyph_name>/outline', methods=['POST'])
def set_glyph_outline(session_id, glyph_name):
    """Update glyph outline from vector editor data."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    font = info['font']
    glyf = font.get('glyf')
    if glyf is None:
        return jsonify({'error': 'No glyf table'}), 404
    
    glyph = glyf.get(glyph_name)
    if glyph is None:
        return jsonify({'error': f'Glyph {glyph_name} not found'}), 404
    
    # Reconstruct glyph from points data
    points = data.get('points', [])
    endPts = data.get('endPtsOfContours', [])
    
    if not points or not endPts:
        return jsonify({'error': 'No point data'}), 400
    
    from fontTools.pens.pointPen import PointToSegmentPen
    from fontTools.pens.t2Pen import T2Pen
    
    # Use a T2 charstring approach to rebuild the glyph
    from fontTools.pens.recordingPen import RecordingPen
    from fontTools.ttLib.tables._g_l_y_f import Glyph
    
    # Build coordinates and flags arrays
    import array
    coords = [(p['x'], p['y']) for p in points]
    flags = array.array('B', [0x01 if p['onCurve'] else 0x00 for p in points])
    
    # Create new glyph from the point data
    new_glyph = Glyph()
    new_glyph.numberOfContours = len(endPts)
    new_glyph.coordinates = coords
    new_glyph.flags = flags
    # endPts must be a list of integers
    new_glyph.endPtsOfContours = [int(e) for e in endPts]
    new_glyph.program = None
    # Note: width is stored in hmtx, not in the glyph object
    
    # Calculate bounds
    if coords:
        xs = [c[0] for c in coords]
        ys = [c[1] for c in coords]
        new_glyph.xMin = min(xs)
        new_glyph.yMin = min(ys)
        new_glyph.xMax = max(xs)
        new_glyph.yMax = max(ys)
    
    glyf[glyph_name] = new_glyph
    
    return jsonify({'ok': True})


@app.route('/api/glyphs/<session_id>', methods=['POST'])
def create_glyph(session_id):
    """Create a new empty glyph."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    glyph_name = data.get('name', '')
    unicode_val = data.get('unicode')  # Optional Unicode value
    
    if not glyph_name:
        return jsonify({'error': 'Glyph name required'}), 400
    
    font = info['font']
    glyf = font.get('glyf')
    if glyf is None:
        return jsonify({'error': 'No glyf table'}), 404
    
    # Check if glyph already exists
    if glyph_name in glyf:
        return jsonify({'error': f'Glyph {glyph_name} already exists'}), 400
    
    # Create empty glyph (0 contours = empty)
    from fontTools.ttLib.tables._g_l_y_f import Glyph
    new_glyph = Glyph()
    new_glyph.numberOfContours = 0
    new_glyph.coordinates = []
    new_glyph.flags = []
    new_glyph.endPtsOfContours = []
    new_glyph.program = None
    new_glyph.xMin = 0
    new_glyph.yMin = 0
    new_glyph.xMax = 0
    new_glyph.yMax = 0
    
    glyf[glyph_name] = new_glyph
    
    # Add to glyph order
    glyph_order = font.getGlyphOrder()
    if glyph_name not in glyph_order:
        font.setGlyphOrder(glyph_order + [glyph_name])
    
    # Set default metrics
    if font.get('hmtx'):
        font['hmtx'].metrics[glyph_name] = (500, 0)  # Default advance width 500
    
    # Update maxp
    if font.get('maxp'):
        font['maxp'].maxNumGlyphs = len(font.getGlyphOrder())
    
    # Add cmap entry if Unicode provided
    if unicode_val and font.get('cmap'):
        for table in font['cmap'].tables:
            if hasattr(table, 'cmap'):
                table.cmap[unicode_val] = glyph_name
    
    # Invalidate cache
    glyph_cache.invalidate()
    
    log_info("Created glyph: %s (Unicode: %s)", glyph_name, hex(unicode_val) if unicode_val else 'N/A')
    
    return jsonify({
        'ok': True,
        'name': glyph_name,
        'unicode': unicode_val,
        'message': f'Glyph {glyph_name} created'
    })

# ─── GPOS / GSUB / OTL ─────────────────────────────────────────────

@app.route('/api/otl/<session_id>/<tag>', methods=['GET'])
def get_otl_table(session_id, tag):
    """Get GPOS or GSUB table structure."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    if tag not in ('GPOS', 'GSUB'):
        return jsonify({'error': 'Invalid table tag'}), 400
    
    result = serialize_otl_table(info['font'], tag)
    if result is None:
        return jsonify({'error': f'Table {tag} not found'}), 404
    
    return jsonify(result)

@app.route('/api/otl/<session_id>/<tag>/lookup/<int:lookup_idx>', methods=['GET'])
def get_otl_lookup(session_id, tag, lookup_idx):
    """Get details of a specific lookup."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    tbl = info['font'].get(tag)
    if tbl is None or not hasattr(tbl, 'table'):
        return jsonify({'error': f'Table {tag} not found'}), 404
    
    lookups = tbl.table.LookupList.Lookup
    if lookup_idx >= len(lookups):
        return jsonify({'error': 'Lookup index out of range'}), 404
    
    lk = serialize_otl_lookup(lookups[lookup_idx])
    lk['index'] = lookup_idx
    return jsonify(lk)

@app.route('/api/otl/<session_id>/<tag>/lookup/<int:lookup_idx>/subtable/<int:st_idx>', methods=['POST'])
def edit_otl_lookup_subtable(session_id, tag, lookup_idx, st_idx):
    """Edit a subtable within a lookup."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    tbl = info['font'].get(tag)
    if tbl is None or not hasattr(tbl, 'table'):
        return jsonify({'error': f'Table {tag} not found'}), 404
    
    lookups = tbl.table.LookupList.Lookup
    if lookup_idx >= len(lookups):
        return jsonify({'error': 'Lookup index out of range'}), 404
    
    lookup = lookups[lookup_idx]
    if st_idx >= len(lookup.SubTable):
        return jsonify({'error': 'Subtable index out of range'}), 404
    
    subtable = lookup.SubTable[st_idx]
    lt = lookup.LookupType
    
    # Handle by type
    if tag == 'GSUB':
        if lt == 1:  # SingleSubst
            mapping = data.get('mapping', {})
            if hasattr(subtable, 'mapping'):
                subtable.mapping = mapping
        elif lt == 2:  # MultipleSubst
            mapping = data.get('mapping', {})
            if hasattr(subtable, 'mapping'):
                subtable.mapping = mapping
        elif lt == 4:  # LigatureSubst
            ligatures = data.get('ligatures', {})
            if hasattr(subtable, 'ligatures'):
                from fontTools.ttLib.tables.G_S_U_B_ import Ligature
                for first, lig_list in ligatures.items():
                    new_ligs = []
                    for lig_data in lig_list:
                        lig = Ligature()
                        lig.LigGlyph = lig_data['glyph']
                        lig.Component = lig_data.get('components', [])
                        new_ligs.append(lig)
                    subtable.ligatures[first] = new_ligs
    
    elif tag == 'GPOS':
        if lt == 1:  # SinglePos
            for key, val in data.items():
                if hasattr(subtable, key):
                    setattr(subtable, key, val)
        elif lt == 2:  # PairPos
            for key, val in data.items():
                if hasattr(subtable, key):
                    setattr(subtable, key, val)
    
    return jsonify({'ok': True})

@app.route('/api/otl/<session_id>/<tag>/feature', methods=['POST'])
def add_otl_feature(session_id, tag):
    """Add a new feature or modify feature-lookup association."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    tbl = info['font'].get(tag)
    if tbl is None:
        return jsonify({'error': f'Table {tag} not found'}), 404
    
    if not hasattr(tbl, 'table') or tbl.table is None:
        from fontTools.ttLib.tables import G_S_U_B_ as gsub_module
        # Need to create the table structure
        return jsonify({'error': 'Cannot create new OTL table yet - use an existing one'}), 400
    
    feature_tag = data.get('featureTag', '')
    lookup_indices = data.get('lookupIndices', [])
    
    if not feature_tag:
        return jsonify({'error': 'Feature tag required'}), 400
    
    # Add to feature list
    from fontTools.ttLib.tables import otTables
    
    # Find or create feature record
    feat_list = tbl.table.FeatureList
    found = None
    for frec in feat_list.FeatureRecord:
        if frec.FeatureTag == feature_tag:
            found = frec
            break
    
    if found:
        # Add lookup indices
        for idx in lookup_indices:
            if idx not in found.Feature.LookupListIndex:
                found.Feature.LookupListIndex.append(idx)
                found.Feature.LookupCount += 1
    else:
        # Create new feature record
        from fontTools.ttLib.tables.otTables import FeatureRecord
        frec = FeatureRecord()
        frec.FeatureTag = feature_tag
        frec.Feature = otTables.Feature()
        frec.Feature.LookupListIndex = list(lookup_indices)
        frec.Feature.LookupCount = len(lookup_indices)
        feat_list.FeatureRecord.append(frec)
        feat_list.FeatureCount += 1
        
        # Also add to default script/lang if possible
        if tbl.table.ScriptList and tbl.table.ScriptList.ScriptRecord:
            for srec in tbl.table.ScriptList.ScriptRecord:
                if srec.Script.DefaultLangSys:
                    dls = srec.Script.DefaultLangSys
                    feat_idx = len(feat_list.FeatureRecord) - 1
                    if feat_idx not in dls.FeatureIndex:
                        dls.FeatureIndex.append(feat_idx)
                        dls.FeatureCount += 1
    
    return jsonify({'ok': True})

@app.route('/api/otl/<session_id>/<tag>/add-lookup', methods=['POST'])
def add_otl_lookup(session_id, tag):
    """Add a new empty lookup to the table."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    tbl = info['font'].get(tag)
    if tbl is None or not hasattr(tbl, 'table') or tbl.table is None:
        return jsonify({'error': f'Table {tag} not found or empty'}), 404
    
    lookup_type = data.get('lookupType', 1)
    
    from fontTools.ttLib.tables import otTables
    new_lookup = otTables.Lookup()
    new_lookup.LookupType = lookup_type
    new_lookup.LookupFlag = 0
    new_lookup.SubTable = []
    new_lookup.LookupCount = 0
    
    tbl.table.LookupList.Lookup.append(new_lookup)
    new_idx = len(tbl.table.LookupList.Lookup) - 1
    tbl.table.LookupList.LookupCount += 1
    
    return jsonify({'ok': True, 'lookupIndex': new_idx})

# ─── GDEF ───────────────────────────────────────────────────────────

@app.route('/api/gdef/<session_id>', methods=['GET'])
def get_gdef(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    gdef = info['font'].get('GDEF')
    if gdef is None:
        return jsonify({'error': 'No GDEF table'}), 404
    
    result = {'glyphClasses': {}, 'attachPoints': {}, 'ligCarets': {}}
    
    if hasattr(gdef, 'table') and gdef.table:
        if gdef.table.GlyphClassDef:
            for name, cls in gdef.table.GlyphClassDef.__dict__.items():
                if isinstance(cls, int):
                    result['glyphClasses'][name] = cls
    
    return jsonify(result)

# ─── fvar (Variable Fonts) ──────────────────────────────────────────

@app.route('/api/fvar/<session_id>', methods=['GET'])
def get_fvar(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    fvar = info['font'].get('fvar')
    if fvar is None:
        return jsonify({'error': 'No fvar table'}), 404
    
    axes = []
    for axis in fvar.axes:
        axes.append({
            'tag': axis.axisTag,
            'min': axis.minValue,
            'default': axis.defaultValue,
            'max': axis.maxValue,
            'name': axis.axisNameID,
        })
    
    instances = []
    for inst in fvar.instances:
        instances.append({
            'name': inst.subfamilyNameID,
            'coordinates': dict(inst.coordinates),
        })
    
    return jsonify({'axes': axes, 'instances': instances})

# ─── Preview ────────────────────────────────────────────────────────

@app.route('/api/preview/<session_id>', methods=['GET'])
def preview_font(session_id):
    """Serve the current font for @font-face preview."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    path = save_font(session_id)
    if not path:
        return jsonify({'error': 'Cannot save font'}), 500
    
    return send_file(path, mimetype='font/sfnt')

@app.route('/api/otl-features/<session_id>', methods=['GET'])
def get_otl_features(session_id):
    """Get a list of all OpenType features with toggle info for preview."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    font = info['font']
    features = []
    
    for tag in ('GSUB', 'GPOS'):
        tbl = font.get(tag)
        if tbl is None or not hasattr(tbl, 'table') or tbl.table is None:
            continue
        tt = tbl.table
        
        if tt.FeatureList:
            for frec in tt.FeatureList.FeatureRecord:
                features.append({
                    'tag': frec.FeatureTag,
                    'table': tag,
                    'lookupCount': len(frec.Feature.LookupListIndex) if hasattr(frec.Feature, 'LookupListIndex') else 0,
                })
    
    # Deduplicate by tag
    seen = set()
    unique = []
    for f in features:
        if f['tag'] not in seen:
            seen.add(f['tag'])
            unique.append(f)
    
    return jsonify({'features': unique})

@app.route('/api/otl-lookup-detail/<session_id>/<tag>/<int:lookup_idx>', methods=['GET'])
def get_otl_lookup_detail(session_id, tag, lookup_idx):
    """Get detailed lookup data for editing, including all subtable content + glyph SVGs."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    tbl = info['font'].get(tag)
    if tbl is None or not hasattr(tbl, 'table'):
        return jsonify({'error': f'Table {tag} not found'}), 404
    
    lookups = tbl.table.LookupList.Lookup
    if lookup_idx >= len(lookups):
        return jsonify({'error': 'Lookup index out of range'}), 404
    
    lookup = lookups[lookup_idx]
    result = {
        'index': lookup_idx,
        'type': lookup.LookupType,
        'flag': lookup.LookupFlag,
        'markFilteringSet': getattr(lookup, 'MarkFilteringSet', None),
        'subtables': [],
        'glyphSvgs': {},  # SVG paths for all referenced glyphs
    }
    
    # Collect all glyph names referenced in this lookup
    referenced_glyphs = set()
    
    for i, st in enumerate(lookup.SubTable):
        sub = {'index': i, 'type': type(st).__name__}
        # Serialize all public attributes
        for attr in dir(st):
            if attr.startswith('_'):
                continue
            try:
                val = getattr(st, attr)
            except Exception:
                continue
            if callable(val):
                continue
            if isinstance(val, (int, float, bool, str)):
                sub[attr] = val
            elif isinstance(val, dict):
                sub[attr] = {str(k): str(v) for k, v in val.items()}
                # Collect glyph names from mapping dicts
                for k, v in val.items():
                    referenced_glyphs.add(str(k))
                    if isinstance(v, (list, tuple)):
                        for item in v:
                            referenced_glyphs.add(str(item))
                    else:
                        referenced_glyphs.add(str(v))
            elif isinstance(val, list) and len(val) < 100:
                sub[attr] = [str(v) if not isinstance(v, (int,float)) else v for v in val]
        result['subtables'].append(sub)
    
    # Generate SVG data for all referenced glyphs
    font = info['font']
    for gname in referenced_glyphs:
        svg = glyph_to_svg(font, gname)
        if svg and svg.get('path'):
            result['glyphSvgs'][gname] = {
                'path': svg['path'],
                'bounds': svg['bounds'],
            }
    
    return jsonify(result)

# ─── Subset ─────────────────────────────────────────────────────────

@app.route('/api/subset/<session_id>', methods=['POST'])
def subset_font(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    chars = data.get('chars', '')
    unicodes = data.get('unicodes', [])
    
    font = info['font']
    
    # Create subset
    opts = SubsetterOptions()
    opts.layout_features = ['*']
    subsetter = Subsetter(options=opts)
    
    if chars:
        subsetter.populate(text=chars)
    if unicodes:
        subsetter.populate(unicodes=unicodes)
    
    subsetter.subset(font)
    
    # Save and serve
    path = save_font(session_id)
    basename = os.path.splitext(info.get('original_name', 'font'))[0]
    return send_file(path, as_attachment=True, download_name=f"{basename}-subset.ttf")

# ─── TTX ────────────────────────────────────────────────────────────

@app.route('/api/ttx/<session_id>', methods=['GET'])
def export_ttx(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    tag = request.args.get('table', None)
    font = info['font']
    
    buf = io.StringIO()
    if tag:
        tbl = font.get(tag)
        if tbl is None:
            return jsonify({'error': f'Table {tag} not found'}), 404
        from fontTools.misc.xmlWriter import XMLWriter
        writer = XMLWriter(buf)
        tbl.toXML(writer, font)
    else:
        font.saveXML(buf)
    
    return jsonify({'ttx': buf.getvalue()})

@app.route('/api/ttx/<session_id>', methods=['POST'])
def import_ttx(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    ttx = data.get('ttx', '')
    tag = data.get('table', None)
    
    font = info['font']
    
    try:
        if tag:
            buf = io.StringIO(ttx)
            from xml.etree import ElementTree
            # This is complex; for now, import full TTX
            return jsonify({'error': 'Partial TTX import not yet supported; use full font TTX'}), 400
        else:
            buf = io.StringIO(ttx)
            new_font = TTFont()
            new_font.importXML(buf)
            info['font'] = new_font
            return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 400

# ─── Config ─────────────────────────────────────────────────────────

@app.route('/api/config/<session_id>', methods=['GET'])
def export_config(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    font = info['font']
    config = {'name': {}, 'metrics': {}, 'cmapChanges': []}
    
    # Name records
    name = font.get('name')
    if name:
        for rec in name.names:
            key = f"{rec.nameID}_{rec.platformID}_{rec.platEncID}_{rec.langID}"
            config['name'][key] = {
                'nameID': rec.nameID,
                'platformID': rec.platformID,
                'encodingID': rec.platEncID,
                'langID': rec.langID,
                'value': rec.toUnicode() if hasattr(rec, 'toUnicode') else str(rec),
            }
    
    # Metrics
    for tag in ['hhea', 'vhea', 'OS/2', 'head', 'post']:
        tbl = font.get(tag)
        if tbl:
            d = {}
            for attr in dir(tbl):
                if attr.startswith('_'):
                    continue
                try:
                    v = getattr(tbl, attr)
                except Exception:
                    continue
                if callable(v):
                    continue
                if isinstance(v, (int, float, bool)):
                    d[attr] = v
            config['metrics'][tag] = d
    
    return jsonify(config)

@app.route('/api/config/<session_id>/apply', methods=['POST'])
def apply_config(session_id):
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    config = request.json
    font = info['font']
    
    # Apply name records
    if 'name' in config:
        name = font.get('name')
        if name:
            for key, rec in config['name'].items():
                name.setName(
                    rec['value'],
                    rec['nameID'],
                    rec.get('platformID', 3),
                    rec.get('encodingID', 1),
                    rec.get('langID', 0x0409),
                )
    
    # Apply metrics
    if 'metrics' in config:
        for tag, values in config['metrics'].items():
            tbl = font.get(tag)
            if tbl:
                for key, value in values.items():
                    if hasattr(tbl, key) and isinstance(getattr(tbl, key), (int, float)):
                        try:
                            setattr(tbl, key, int(value) if isinstance(getattr(tbl, key), int) else float(value))
                        except:
                            pass
    
    return jsonify({'ok': True})

@app.route('/api/config/<session_id>/diff', methods=['POST'])
def diff_config(session_id):
    """Compare current font values with a config."""
    info = get_font(session_id)
    if not info:
        return jsonify({'error': 'Session not found'}), 404
    
    config = request.json
    font = info['font']
    diffs = []
    
    # Compare metrics
    if 'metrics' in config:
        for tag, values in config['metrics'].items():
            tbl = font.get(tag)
            if tbl:
                for key, value in values.items():
                    if hasattr(tbl, key):
                        current = getattr(tbl, key)
                        if isinstance(current, (int, float)) and current != value:
                            diffs.append({
                                'table': tag,
                                'field': key,
                                'current': current,
                                'config': value,
                            })
    
    # Compare names
    if 'name' in config:
        name = font.get('name')
        if name:
            for key, rec in config['name'].items():
                for existing in name.names:
                    if (existing.nameID == rec['nameID'] and
                        existing.platformID == rec.get('platformID', 3) and
                        existing.langID == rec.get('langID', 0x0409)):
                        current = existing.toUnicode() if hasattr(existing, 'toUnicode') else str(existing)
                        if current != rec['value']:
                            diffs.append({
                                'table': 'name',
                                'nameID': rec['nameID'],
                                'current': current,
                                'config': rec['value'],
                            })
    
    return jsonify({'diffs': diffs})

# ─── Batch apply ────────────────────────────────────────────────────

@app.route('/api/batch-apply', methods=['POST'])
def batch_apply():
    """Apply a config to multiple uploaded fonts, return download links."""
    config = request.json.get('config', {})
    
    results = []
    files = request.files.getlist('files')
    
    for f in files:
        session_id = str(uuid.uuid4())[:8]
        temp_path = os.path.join(FONTS_DIR, f"{session_id}.ttf")
        f.save(temp_path)
        
        try:
            font = TTFont(temp_path)
            fonts[session_id] = {
                'path': temp_path,
                'font': font,
                'original_name': f.filename,
            }
            
            # Apply config
            if 'name' in config:
                name = font.get('name')
                if name:
                    for key, rec in config['name'].items():
                        name.setName(
                            rec['value'],
                            rec['nameID'],
                            rec.get('platformID', 3),
                            rec.get('encodingID', 1),
                            rec.get('langID', 0x0409),
                        )
            
            if 'metrics' in config:
                for tag, values in config['metrics'].items():
                    tbl = font.get(tag)
                    if tbl:
                        for key, value in values.items():
                            if hasattr(tbl, key) and isinstance(getattr(tbl, key), (int, float)):
                                try:
                                    setattr(tbl, key, int(value) if isinstance(getattr(tbl, key), int) else float(value))
                                except:
                                    pass
            
            save_font(session_id)
            results.append({
                'filename': f.filename,
                'sessionId': session_id,
                'status': 'ok',
            })
        except Exception as e:
            results.append({
                'filename': f.filename,
                'error': str(e),
                'status': 'error',
            })
    
    return jsonify({'results': results})


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print("=" * 60)
    print("  TypeForge Pro v2 — fonttools Backend")
    print("  http://localhost:5000")
    print("=" * 60)
    app.run(debug=True, port=5000)
