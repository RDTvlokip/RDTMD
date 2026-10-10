(function (root) {
  'use strict';
  /* RDTHighlight : coloration syntaxique maison from scratch. Texte -> jetons [classe, texte]. */

  const R = String.raw;
  const S = (s) => new Set(s.split(/\s+/).filter(Boolean));

  // Regex primitives
  const DQ = R`"(?:\\.|[^"\\\n])*"?`;
  const SQ = R`'(?:\\.|[^'\\\n])*'?`;
  const BT = R`\x60(?:\\[\s\S]|[^\x60\\])*\x60?`;
  const TDQ = R`"""[\s\S]*?(?:"""|(?![\s\S]))`;
  const TSQ = R`'''[\s\S]*?(?:'''|(?![\s\S]))`;
  const BC = R`\/\*[\s\S]*?(?:\*\/|(?![\s\S]))`;
  const SLASH = R`\/\/.*`;
  const HASH = R`#.*`;
  const DASH = R`--.*`;
  const SEMI = R`;.*`;
  const PERCENT = R`%.*`;

  // Nombres avec suffixes éventuels (ex: 10u32, 1.5f, 0xFF, 1_000_000)
  const NUM = R`\b(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)(?:[a-zA-Z]\w*)?`;

  // Opérateurs et ponctuation
  const OPS_RE = R`=>|->|::|\+\+|--|<<=|>>=|<=|>=|===|!==|==|!=|&&|\|\||\?\?|\?\.|<<|>>|\+=|-=|\*=|/=|%=|&=|\|=|\^=|\+|-|\*|/|%|=|!|<|>|&|\||\^|~|\?|:`;
  const PUNCT_RE = R`[()\[\]{},;]`;

  // Mots-clés introduisant une définition de fonction
  const FN_DEF_KW = S('def fn func function fun sub procedure');
  // Mots-clés introduisant une classe ou un type
  const TYPE_DEF_KW = S('class interface extends implements new struct enum trait type union typedef actor');

  const L = Object.create(null);
  const def = (names, cfg) => names.split(' ').forEach((n) => { L[n] = cfg; });

  const JS_KW = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await get set from as';
  const JS_BI = 'console window document Math JSON Object Array String Number Boolean Promise Map Set Date Error RegExp require module exports process parseInt parseFloat setTimeout setInterval fetch URL';
  const C_KW = 'if else for while do switch case break continue return goto default sizeof typedef struct union enum const static extern volatile register inline unsigned signed void int char short long float double';
  const C_BI = 'printf scanf malloc free calloc realloc memcpy memset strlen strcmp fopen fclose size_t uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t';

  // --- Python ---
  def('python py', {
    cmt: [HASH], str: [TDQ, TSQ, DQ, SQ], deco: true,
    kw: S('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'),
    lit: S('True False None'),
    bi: S('print len range int str float list dict set tuple bool open type isinstance super self cls enumerate zip map filter sorted sum min max abs any all input id iter next repr round reversed bytes bytearray torch nn F np numpy pd pandas plt tensor autograd optim cuda DataLoader Dataset Transformer Adam SGD Conv2d Linear ReLU Softmax CrossEntropyLoss Sequential Module ModuleList Parameter exp log sqrt mean item backward step zero_grad shape dtype device dim clamp unsqueeze squeeze cat stack'),
    hasInterp: true,
  });

  // --- JavaScript / TypeScript ---
  def('javascript js jsx mjs cjs', {
    cmt: [SLASH, BC], str: [BT, DQ, SQ],
    kw: S(JS_KW), lit: S('true false null undefined NaN Infinity'),
    bi: S(JS_BI + ' useState useEffect useMemo useCallback useRef useContext useReducer useLayoutEffect useId React Component Fragment NextPage NextRequest NextResponse Express Fastify Hono URLSearchParams Blob File FormData Headers Response Request console log error warn info table time timeEnd'),
    hasInterp: true, jsRegex: true,
  });
  def('typescript ts tsx', {
    cmt: [SLASH, BC], str: [BT, DQ, SQ], deco: true,
    kw: S(JS_KW + ' interface type enum implements private public protected readonly abstract namespace declare keyof infer is override satisfies readonly as const'),
    lit: S('true false null undefined NaN Infinity'),
    bi: S(JS_BI + ' string number boolean unknown never any void Record Partial Pick Omit Readonly useState useEffect useMemo useCallback useRef useContext useReducer useLayoutEffect useId React Component Fragment NextPage NextRequest NextResponse Express Fastify Hono URLSearchParams Blob File FormData Headers Response Request console log error warn info table time timeEnd'),
    hasInterp: true, jsRegex: true,
  });

  // --- JSON ---
  def('json jsonc', { cmt: [SLASH, BC], str: [DQ], propColon: true, lit: S('true false null') });

  // --- Bash / Shell / Zsh ---
  def('bash sh shell zsh', {
    cmt: [HASH], str: [DQ, SQ],
    extra: [
      ['va', R`\$(?:\{[^}\n]*\}|[A-Za-z_]\w*|[0-9@#?*!$-])`],
      ['fl', R`\B--?[a-zA-Z][\w-]*`],
    ],
    kw: S('if then else elif fi for while until do done case esac in function select time return exit break continue local export readonly unset declare source alias'),
    bi: S('echo cd ls cat grep sed awk find mkdir rm cp mv chmod chown sudo apt npm npx pip python python3 node git curl wget tar ssh docker make cmake clear printf'),
    noFn: true, word: R`[A-Za-z_][\w-]*`, hasInterp: true,
  });

  // --- C / C++ ---
  def('c h', {
    cmt: [SLASH, BC], str: [DQ, SQ], extra: [['pp', R`^[ \t]*#[ \t]*\w+`]],
    kw: S(C_KW), lit: S('NULL true false'), bi: S(C_BI),
  });
  def('cpp cc cxx hpp c++', {
    cmt: [SLASH, BC], str: [DQ, SQ], extra: [['pp', R`^[ \t]*#[ \t]*\w+`]],
    kw: S(C_KW + ' class namespace template typename public private protected virtual override new delete this using try catch throw operator friend explicit constexpr auto static_cast dynamic_cast reinterpret_cast const_cast noexcept bool concept requires co_await co_yield co_return'),
    lit: S('true false NULL nullptr'),
    bi: S(C_BI + ' std cout cin endl string vector map unique_ptr shared_ptr make_shared make_unique array unordered_map pair tuple'),
  });

  // --- Java ---
  def('java', {
    cmt: [SLASH, BC], str: [TDQ, DQ, SQ], deco: true,
    kw: S('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed permits non-sealed yield'),
    lit: S('true false null'), bi: S('String System Math Integer Double Long Boolean List Map Set ArrayList HashMap Object Thread Exception Override'),
  });

  // --- C# ---
  def('csharp cs', {
    cmt: [SLASH, BC], str: [DQ, SQ],
    kw: S('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly ref return sbyte sealed short sizeof static string struct switch this throw try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await record init not and or with'),
    lit: S('true false null'), bi: S('Console Math List Dictionary Task String Int32 Boolean Action Func Guid'),
  });

  // --- Go ---
  def('go golang', {
    cmt: [SLASH, BC], str: [BT, DQ, SQ],
    kw: S('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var any'),
    lit: S('true false nil iota'),
    bi: S('fmt string int int64 int32 int16 int8 uint uint64 uint32 uint16 uint8 float64 float32 bool byte rune error len cap make new append copy panic recover print println delete complex real imag'),
  });

  // --- Rust ---
  def('rust rs', {
    cmt: [SLASH, BC], str: [DQ, R`b?"(?:\\.|[^"\\\n])*"?`], bang: true,
    extra: [
      ['de', R`#!?\[[^\]\n]*\]`],
      ['lt', R`'[a-zA-Z_]\w*\b`],
      ['nu', R`\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?(?:[ui](?:8|16|32|64|128|size)|f(?:32|64))?\b`],
    ],
    kw: S('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while yield'),
    lit: S('true false None Some Ok Err'),
    bi: S('Vec String Option Result Box str i32 i64 u8 u16 u32 u64 usize isize f32 f64 bool char println format panic drop clone to_string as_ref default'),
  });

  // --- SQL ---
  def('sql', {
    cmt: [DASH, BC], str: [SQ, DQ], ci: true,
    kw: S('select from where and or not insert into values update set delete create table alter drop index join inner left right outer full on group by order having limit offset as distinct union all is in like between case when then else end primary key foreign references default unique check constraint exists asc desc view cascade trigger replace with'),
    lit: S('true false null'),
    bi: S('count sum avg min max coalesce now substr length concat cast round upper lower trim'),
  });

  // --- PHP ---
  def('php', {
    cmt: [SLASH, BC, HASH], str: [DQ, SQ],
    extra: [['va', R`\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*`]],
    kw: S('abstract and as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try use var while xor yield from'),
    lit: S('true false null TRUE FALSE NULL'),
    bi: S('var_dump count in_array array_map array_filter explode implode strlen strpos substr header json_encode json_decode intval strval floatval boolval sprintf'),
    hasInterp: true,
  });

  // --- Ruby ---
  def('ruby rb', {
    cmt: [HASH], str: [DQ, SQ],
    extra: [
      ['va', R`@@?[a-zA-Z_]\w*|\$[a-zA-Z_0-9]+`],
      ['pr', R`:[a-zA-Z_]\w*`],
    ],
    kw: S('alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield'),
    lit: S('true false nil self'),
    bi: S('puts print p raise require require_relative attr_accessor attr_reader attr_writer include extend loop lambda proc'),
    hasInterp: true,
  });

  // --- Kotlin ---
  def('kotlin kt', {
    cmt: [SLASH, BC], str: [TDQ, DQ, SQ], deco: true,
    kw: S('as as? break class continue do else false for fun if in !in interface is !is null object package return super this true try typealias val var when while by catch constructor delegate dynamic field file finally get import init open operator override private protected public set value where actual abstract annotation companion crossinline data enum expect external final inline infix inner internal lateinit noinline out reified sealed suspend tailrec vararg'),
    lit: S('true false null'),
    bi: S('println print listOf mapOf setOf arrayOf mutableListOf mutableMapOf apply let run also with repeat check require error'),
    hasInterp: true,
  });

  // --- Swift ---
  def('swift', {
    cmt: [SLASH, BC], str: [TDQ, DQ],
    kw: S('associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as Any catch false is nil super self Self throw throws true try async await actor some'),
    lit: S('true false nil'),
    bi: S('print fatalError min max abs zip map filter reduce count first last contains compactMap'),
    hasInterp: true,
  });

  // --- Lua ---
  def('lua', {
    cmt: [R`--\[\[[\s\S]*?(?:\]\]|(?![\s\S]))`, DASH], str: [R`\[\[[\s\S]*?(?:\]\]|(?![\s\S]))`, DQ, SQ],
    kw: S('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'),
    lit: S('true false nil'),
    bi: S('print assert collectgarbage dofile error getmetatable ipairs load loadfile next pairs pcall rawequal rawget rawlen rawset require select setmetatable tonumber tostring type xpcall string table math io os debug'),
  });

  // --- PowerShell ---
  def('powershell ps1 ps', {
    cmt: [R`<#[\s\S]*?(?:#>|(?![\s\S]))`, HASH], str: [DQ, SQ], ci: true,
    word: R`[A-Za-z_][\w-]*`,
    extra: [
      ['va', R`\$[a-zA-Z_0-9:]+`],
      ['fl', R`-[a-zA-Z][\w-]*`],
    ],
    kw: S('begin break catch class continue data do dynamicparam else elseif end exit filter finally for foreach from function hidden if in param process return switch throw trap try until using while workflow'),
    lit: S('$true $false $null true false null'),
    bi: S('write-host write-output get-childitem get-item get-content set-content new-item remove-item test-path start-process stop-process select-object where-object foreach-object measure-object sort-object out-file import-csv export-csv'),
    hasInterp: true,
  });

  // --- Batch / CMD ---
  def('batch bat cmd', {
    cmt: [R`^[ \t]*(?:rem|REM|::).*`], str: [DQ], ci: true,
    extra: [
      ['va', R`%[a-zA-Z0-9_]+%|%\d|![a-zA-Z0-9_]+!`],
    ],
    kw: S('echo on off set if else goto call exit pause for in do cls shift setlocal endlocal not exist errorlevel defined cd dir copy del move md rd ren type find findstr ping tasklist taskkill'),
    lit: S('nul'),
  });

  // --- Dockerfile ---
  def('dockerfile docker', {
    cmt: [HASH], str: [DQ, SQ],
    extra: [
      ['va', R`\$(?:\{[^}\n]*\}|[A-Za-z_]\w*)`],
      ['kw', R`^[ \t]*(?:FROM|MAINTAINER|RUN|CMD|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b`],
    ],
    kw: S('as AS'),
  });

  // --- Makefile ---
  def('makefile make', {
    cmt: [HASH], str: [DQ, SQ],
    extra: [
      ['va', R`\$\([a-zA-Z0-9_.-]+\)|\$\{[a-zA-Z0-9_.-]+\}|\$[@%<?^+*]`],
      ['fn', R`^[a-zA-Z0-9_./-]+(?=\s*:)`],
    ],
    kw: S('ifeq else endif ifneq ifdef ifndef include override export unexport define endef vpath'),
    bi: S('subst patsubst strip findstring filter filter-out sort word words wordlist firstword lastword dir notdir suffix basename addsuffix addprefix join wildcard realpath abspath error warning info shell origin flavor foreach if or and call eval value'),
  });

  // --- Markdown ---
  def('markdown md', {
    extra: [
      ['ty', R`^#{1,6}\s+.*$`],
      ['st', R`\*\*.*?\*\*|__.*?__`],
      ['cm', R`<!--[\s\S]*?(?:-->|(?![\s\S]))`],
      ['pr', R`\[.*?\]\(.*?\)`],
      ['nu', R`^[-*+]\s+`],
    ],
  });

  // --- Diff ---
  def('diff', {
    isDiff: true,
  });

  // --- LaTeX ---
  def('latex tex', {
    cmt: [PERCENT],
    extra: [
      ['kw', R`\\[a-zA-Z]+`],
      ['nu', R`\$[^$\n]+\$`],
      ['pu', R`[{}\[\]]`],
    ],
  });

  // --- R ---
  def('r', {
    cmt: [HASH], str: [DQ, SQ],
    kw: S('if else repeat while function for in next break TRUE FALSE NULL Inf NaN NA NA_integer_ NA_real_ NA_complex_ NA_character_'),
    lit: S('TRUE FALSE NULL Inf NaN NA'),
    bi: S('c list matrix data.frame summary plot print cat length names dim nrow ncol apply lapply sapply paste paste0 rep seq which is.na is.null as.numeric as.character as.factor library require'),
  });

  // --- Perl ---
  def('perl pl', {
    cmt: [HASH], str: [DQ, SQ],
    extra: [['va', R`[$@%][a-zA-Z_]\w*`]],
    kw: S('my our local state sub if elsif else unless while until for foreach do given when default last next redo return goto package use require no has'),
    lit: S('undef'),
    bi: S('print say chomp chop push pop shift unshift split join keys values each map grep sort die warn open close read write'),
    hasInterp: true,
  });

  // --- CSS ---
  def('css', {
    cmt: [BC], str: [DQ, SQ], propColon: true, word: R`-?[A-Za-z_][\w-]*`,
    extra: [
      ['kw', R`@[\w-]+|!important`],
      ['va', R`--[\w-]+`],
      ['nu', R`#[0-9a-fA-F]{3,8}\b`],
      ['nu', R`-?\d*\.?\d+(?:px|em|rem|%|vh|vw|ms|s|deg|fr|ch|pt|cm|mm)?\b`],
      ['ty', R`\.[a-zA-Z_][\w-]*`],
      ['pr', R`#[a-zA-Z_][\w-]*`],
      ['fn', R`:[a-zA-Z_][\w-]*`],
    ],
  });

  // --- YAML / TOML / INI ---
  def('yaml yml', {
    cmt: [HASH], str: [DQ, SQ], propColon: true, word: R`[A-Za-z_][\w.-]*`,
    extra: [['de', R`[&*][A-Za-z_][\w-]*`]],
    lit: S('true false null yes no on off True False TRUE FALSE NULL'),
  });
  def('toml ini', {
    cmt: [HASH, SEMI], str: [DQ, SQ], word: R`[A-Za-z_][\w.-]*`,
    extra: [
      ['ty', R`^\[[^\]\n]+\]`],
      ['pr', R`[A-Za-z_][\w.-]*(?=\s*=)`],
    ],
    lit: S('true false null yes no on off True False'),
  });

  // --- HTML / XML / SVG ---
  def('html xml svg', {
    cmt: [R`<!--[\s\S]*?(?:-->|(?![\s\S]))`], str: [R`"[^"\n]*"?`, R`'[^'\n]*'?`],
    extra: [
      ['dt', R`<!DOCTYPE[^>]*>`],
      ['tg', R`<\/?[A-Za-z][\w:-]*|\/?>`],
      ['at', R`[A-Za-z_:][\w:.-]*(?==)`],
      ['en', R`&[A-Za-z0-9#]+;`],
    ],
    word: R`[A-Za-z_][\w-]*`,
  });

  // --- Regex ---
  def('regex', {
    extra: [
      ['es', R`\\[dDsSwWbBtrnvf0\\^$*+?.()|[\]{}]`],
      ['op', R`[\^$*+?|()]`],
      ['pu', R`[\[\]{}]`],
      ['nu', R`\d+`],
    ],
  });

  // --- Nginx ---
  def('nginx', {
    cmt: [HASH], str: [DQ, SQ],
    extra: [['va', R`\$[a-zA-Z_]\w*`]],
    kw: S('server location http events upstream listen server_name root index proxy_pass proxy_set_header try_files return rewrite access_log error_log ssl_certificate ssl_certificate_key include fastcgi_pass fastcgi_param gzip gzip_types worker_processes worker_connections sendfile tcp_nopush tcp_nodelay keepalive_timeout default_type client_max_body_size error_page'),
  });

  // --- GraphQL ---
  def('graphql gql', {
    cmt: [HASH], str: [DQ, TDQ],
    extra: [
      ['va', R`\$[a-zA-Z_]\w*`],
      ['de', R`@[a-zA-Z_]\w*`],
    ],
    kw: S('query mutation subscription type interface union schema enum input implements directive on fragment extend scalar repeat true false null'),
    bi: S('Int Float String Boolean ID'),
  });

  // Regex pour découper les chaînes (échappements et interpolations)
  const RE_ESC = /\\(?:[nrtbfav0\\'"e$?]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]+\}|c[A-Za-z]|.)/g;
  const RE_INTERP = /\$\{[^}\n]*\}|\$[a-zA-Z_]\w*|#\{[^}\n]*\}|\\\(.*?\)|\{[a-zA-Z_]\w*(?::[^}\n]*)?\}/g;

  function splitString(s, hasInterp) {
    if (!s || s.length < 2) return [['st', s]];
    const parts = [];
    const re = hasInterp
      ? new RegExp('(' + RE_ESC.source + ')|(' + RE_INTERP.source + ')', 'g')
      : new RegExp('(' + RE_ESC.source + ')', 'g');

    let last = 0;
    for (const m of s.matchAll(re)) {
      if (m.index > last) parts.push(['st', s.slice(last, m.index)]);
      if (m[1]) parts.push(['es', m[0]]);
      else if (m[2]) parts.push(['it', m[0]]);
      else parts.push(['es', m[0]]);
      last = m.index + m[0].length;
    }
    if (last < s.length) parts.push(['st', s.slice(last)]);
    return parts.length ? parts : [['st', s]];
  }

  function compile(cfg) {
    const alts = [];
    (cfg.cmt || []).forEach((s) => alts.push(['cm', s]));
    (cfg.str || []).forEach((s) => alts.push(['st', s]));
    (cfg.extra || []).forEach((e) => alts.push(e));
    if (cfg.deco) alts.push(['de', R`@[A-Za-z_][\w.]*`]);
    alts.push(['nu', NUM]);
    alts.push(['wd', cfg.word || R`[A-Za-z_$][\w$]*`]);
    alts.push(['op', OPS_RE]);
    alts.push(['pu', PUNCT_RE]);

    const src = alts.map((a, i) => '(?<g' + i + '>' + a[1] + ')').join('|');
    return { re: new RegExp(src, 'gm'), alts };
  }

  function tokenizeDiff(code) {
    const lines = code.split('\n');
    const out = [];
    lines.forEach((l, i) => {
      let cls = null;
      if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ') || l.startsWith('index ')) cls = 'df-hdr';
      else if (l.startsWith('+')) cls = 'df-add';
      else if (l.startsWith('-')) cls = 'df-del';
      else if (l.startsWith('@@')) cls = 'df-hunk';
      out.push([cls, l]);
      if (i < lines.length - 1) out.push([null, '\n']);
    });
    return out;
  }

  /** Retourne une liste de jetons [classe|null, texte]. */
  function tokenize(code, lang) {
    const lk = String(lang || '').toLowerCase().trim();
    const cfg = L[lk];
    if (!cfg) return [[null, code]];
    if (cfg.isDiff) return tokenizeDiff(code);

    if (!cfg._c) cfg._c = compile(cfg);
    const { re, alts } = cfg._c;
    const out = [];

    const push = (cls, text) => {
      if (!text) return;
      const prev = out[out.length - 1];
      if (prev && prev[0] === cls) prev[1] += text;
      else out.push([cls, text]);
    };

    let last = 0;
    let prevNonWsWord = '';
    let prevChar = '';

    re.lastIndex = 0;
    for (const m of code.matchAll(re)) {
      const skipped = code.slice(last, m.index);
      if (skipped) {
        push(null, skipped);
        const trimmed = skipped.trim();
        if (trimmed) prevChar = trimmed.slice(-1);
      }

      let idx = 0;
      while (m.groups['g' + idx] === undefined) idx++;
      const t = m[0], end = m.index + t.length;
      let cls = alts[idx][0];

      if (cls === 'st') {
        const isProp = cfg.propColon && /^[ \t]*:/.test(code.slice(end, end + 40));
        if (isProp) {
          push('pr', t);
        } else {
          const parts = splitString(t, cfg.hasInterp);
          parts.forEach(([subCls, subTxt]) => push(subCls, subTxt));
        }
        last = end;
        prevChar = t.slice(-1);
        continue;
      }

      if (cls === 'wd') {
        const k = cfg.ci ? t.toLowerCase() : t;
        const rest = code.slice(end, end + 40);

        if (cfg.kw && cfg.kw.has(k)) {
          cls = 'kw';
          prevNonWsWord = k;
        } else if (cfg.lit && cfg.lit.has(k)) {
          cls = 'li';
          prevNonWsWord = k;
        } else if (cfg.bi && cfg.bi.has(k)) {
          cls = 'bi';
          prevNonWsWord = k;
        } else if (prevChar === '.') {
          cls = 'pr';
        } else if (FN_DEF_KW.has(prevNonWsWord)) {
          cls = 'fd';
          prevNonWsWord = '';
        } else if (TYPE_DEF_KW.has(prevNonWsWord)) {
          cls = 'ty';
          prevNonWsWord = '';
        } else if (cfg.propColon && /^[ \t]*:/.test(rest)) {
          cls = 'pr';
        } else if (!cfg.noFn && (/^[ \t]*\(/.test(rest) || (cfg.bang && rest[0] === '!'))) {
          cls = 'fn';
        } else if (t.length > 1 && /^[A-Z][A-Z0-9_]+$/.test(t)) {
          cls = 'co';
        } else if (/^[A-Z][a-zA-Z0-9_]*$/.test(t)) {
          cls = 'ty';
        } else {
          cls = null;
        }
      } else if (cls === 'op') {
        prevChar = t;
      } else if (cls === 'pu') {
        prevChar = t;
      }

      push(cls, t);
      last = end;
    }
    push(null, code.slice(last));
    return out;
  }

  function render(code, lang) {
    const tokens = tokenize(code, lang);
    const isDiff = String(lang || '').toLowerCase().trim() === 'diff';
    const isChange = (idx) => idx >= 0 && idx < tokens.length && (tokens[idx][0] === 'df-add' || tokens[idx][0] === 'df-del');

    return tokens.map(([cls, text], i) => {
      if (!cls) return document.createTextNode(text);
      const e = document.createElement('span');
      let fullCls = 'tk-' + cls;
      if (isDiff && (cls === 'df-add' || cls === 'df-del')) {
        const isTop = !isChange(i - 2);
        const isBot = !isChange(i + 2);
        if (isTop) fullCls += ' tk-df-top';
        if (isBot) fullCls += ' tk-df-bot';
      }
      e.className = fullCls;
      e.textContent = text;
      return e;
    });
  }

  root.RDTHighlight = { render, tokenize };
  if (typeof module !== 'undefined' && module.exports) module.exports = { tokenize, render };
})(typeof window !== 'undefined' ? window : globalThis);
