/* Circuit Lab — Arduino-C interpreter for simulated microcontrollers.
   Write real setup()/loop() sketches; a tree-walking interpreter (built on JS
   generators so delay() yields, like real firmware timing) drives the board's
   simulated GPIO pins. DOM-free. */
'use strict';

const MCU = (() => {

  /* ---------------- Lexer ---------------- */
  const KEYWORDS = new Set(['void','int','long','float','double','bool','boolean','char','byte','unsigned','const','static','if','else','while','for','return','break','continue','true','false','String']);
  function lex(src){
    const toks = []; let i=0, line=1;
    const push=(t,v)=>toks.push({t,v,line});
    while (i<src.length){
      const c = src[i];
      if (c==='\n'){ line++; i++; continue; }
      if (/\s/.test(c)){ i++; continue; }
      if (c==='/' && src[i+1]==='/'){ while(i<src.length && src[i]!=='\n') i++; continue; }
      if (c==='/' && src[i+1]==='*'){ i+=2; while(i<src.length && !(src[i]==='*'&&src[i+1]==='/')){ if(src[i]==='\n')line++; i++; } i+=2; continue; }
      if (c==='#'){ while(i<src.length && src[i]!=='\n') i++; continue; } // ignore #include/#define lines (defines unsupported)
      if (/[0-9]/.test(c) || (c==='.' && /[0-9]/.test(src[i+1]||''))){
        let j=i; if (src[i]==='0' && (src[i+1]==='x'||src[i+1]==='X')){ j=i+2; while(/[0-9a-fA-F]/.test(src[j]||''))j++; push('num', parseInt(src.slice(i,j),16)); }
        else { while(/[0-9.]/.test(src[j]||''))j++; while(/[fFlLuU]/.test(src[j]||''))j++; push('num', parseFloat(src.slice(i,j))); }
        i=j; continue;
      }
      if (/[A-Za-z_]/.test(c)){
        let j=i; while(/[A-Za-z0-9_]/.test(src[j]||''))j++;
        const w = src.slice(i,j);
        push(KEYWORDS.has(w)?'kw':'id', w); i=j; continue;
      }
      if (c==='"' || c==="'"){
        let j=i+1, s='';
        while(j<src.length && src[j]!==c){ if(src[j]==='\\'){ const n=src[j+1]; s += n==='n'?'\n':n==='t'?'\t':n; j+=2; } else s+=src[j++]; }
        push(c==='"'?'str':'chr', c==='"'?s:s.charCodeAt(0)||0); i=j+1; continue;
      }
      const three = src.substr(i,3), two = src.substr(i,2);
      if (['<<=','>>='].includes(three)){ push('op',three); i+=3; continue; }
      if (['==','!=','<=','>=','&&','||','++','--','+=','-=','*=','/=','%=','<<','>>','&=','|='].includes(two)){ push('op',two); i+=2; continue; }
      if ('+-*/%<>=!&|^~?:;,(){}[].'.includes(c)){ push('op',c); i++; continue; }
      throw new SyntaxError(`Unexpected character '${c}' on line ${line}`);
    }
    push('eof',''); return toks;
  }

  /* ---------------- Parser (recursive descent → AST) ---------------- */
  const BIN_LEVELS = [ ['||'], ['&&'], ['|'], ['^'], ['&'], ['==','!='], ['<','>','<=','>='], ['<<','>>'], ['+','-'], ['*','/','%'] ];
  function parse(src){
    const toks = lex(src); let pos=0;
    const peek=(o=0)=>toks[pos+o];
    const next=()=>toks[pos++];
    const at=(t,v)=>peek().t===t && (v===undefined||peek().v===v);
    const eat=(t,v)=>{ if(!at(t,v)) err(`expected '${v??t}' but found '${peek().v}'`); return next(); };
    const err=m=>{ throw new SyntaxError(`Line ${peek().line}: ${m}`); };
    const isType=()=>at('kw') && ['void','int','long','float','double','bool','boolean','char','byte','unsigned','const','static','String'].includes(peek().v);

    function skipType(){ while(isType()) next(); }

    const prog = { globals:[], funcs:{} };
    while (!at('eof')){
      if (!isType()) err(`expected a declaration (like 'int x = 0;' or 'void setup() {...}')`);
      skipType();
      const name = eat('id').v;
      if (at('op','(')){ // function definition
        next();
        const params=[];
        while(!at('op',')')){ skipType(); params.push(eat('id').v); if(at('op',','))next(); }
        eat('op',')');
        const body = parseBlock();
        prog.funcs[name] = {params, body};
      } else { // global var(s)
        pos--; // back to name
        const decl = parseVarDecl();
        prog.globals.push(decl);
        eat('op',';');
      }
    }
    return prog;

    function parseVarDecl(){
      const vars=[];
      do {
        const name = eat('id').v;
        let init=null, arr=null;
        if (at('op','[')){ next(); arr = at('op',']')?null:parseExpr(); eat('op',']'); }
        if (at('op','=')){ next();
          if (at('op','{')){ next(); const items=[]; while(!at('op','}')){ items.push(parseExpr()); if(at('op',','))next(); } next(); init={k:'arrlit',items}; }
          else init = parseAssign();
        }
        vars.push({name, init, arr});
      } while (at('op',',') && next());
      return {k:'decl', vars};
    }

    function parseBlock(){
      eat('op','{');
      const stmts=[];
      while(!at('op','}')) stmts.push(parseStmt());
      eat('op','}');
      return {k:'block', stmts};
    }

    function parseStmt(){
      if (at('op','{')) return parseBlock();
      if (at('op',';')){ next(); return {k:'empty'}; }
      if (isType()){ skipType(); const d = parseVarDecl(); eat('op',';'); return d; }
      if (at('kw','if')){ next(); eat('op','('); const cond=parseExpr(); eat('op',')');
        const then=parseStmt(); let els=null;
        if (at('kw','else')){ next(); els=parseStmt(); }
        return {k:'if', cond, then, els};
      }
      if (at('kw','while')){ next(); eat('op','('); const cond=parseExpr(); eat('op',')'); return {k:'while', cond, body:parseStmt()}; }
      if (at('kw','for')){ next(); eat('op','(');
        let init=null;
        if (!at('op',';')){ if(isType()){skipType(); init=parseVarDecl();} else init={k:'expr', e:parseExpr()}; }
        eat('op',';');
        const cond = at('op',';')?null:parseExpr(); eat('op',';');
        const step = at('op',')')?null:parseExpr(); eat('op',')');
        return {k:'for', init, cond, step, body:parseStmt()};
      }
      if (at('kw','return')){ next(); const e = at('op',';')?null:parseExpr(); eat('op',';'); return {k:'return', e}; }
      if (at('kw','break')){ next(); eat('op',';'); return {k:'break'}; }
      if (at('kw','continue')){ next(); eat('op',';'); return {k:'continue'}; }
      const e = parseExpr(); eat('op',';'); return {k:'expr', e};
    }

    function parseExpr(){ // comma not supported at top; assignment level
      return parseAssign();
    }
    function parseAssign(){
      const l = parseTernary();
      if (at('op') && ['=','+=','-=','*=','/=','%=','&=','|='].includes(peek().v)){
        const op = next().v; const r = parseAssign();
        return {k:'assign', op, l, r};
      }
      return l;
    }
    function parseTernary(){
      let c = parseBin(0);
      if (at('op','?')){ next(); const a=parseAssign(); eat('op',':'); const b=parseAssign(); return {k:'tern', c, a, b}; }
      return c;
    }
    function parseBin(lvl){
      if (lvl>=BIN_LEVELS.length) return parseUnary();
      let l = parseBin(lvl+1);
      while (at('op') && BIN_LEVELS[lvl].includes(peek().v)){
        const op = next().v;
        const r = parseBin(lvl+1);
        l = {k:'bin', op, l, r};
      }
      return l;
    }
    function parseUnary(){
      if (at('op','!')||at('op','-')||at('op','~')||at('op','+')){ const op=next().v; return {k:'un', op, e:parseUnary()}; }
      if (at('op','++')||at('op','--')){ const op=next().v; const e=parseUnary(); return {k:'preinc', op, e}; }
      return parsePostfix();
    }
    function parsePostfix(){
      let e = parsePrimary();
      for(;;){
        if (at('op','(')){ next();
          const args=[];
          while(!at('op',')')){ args.push(parseAssign()); if(at('op',','))next(); }
          eat('op',')');
          e = {k:'call', target:e, args};
        } else if (at('op','.')){ next(); const m = eat('id').v; e = {k:'member', obj:e, m}; }
        else if (at('op','[')){ next(); const i=parseExpr(); eat('op',']'); e={k:'index', obj:e, i}; }
        else if (at('op','++')||at('op','--')){ const op=next().v; e={k:'postinc', op, e}; }
        else break;
      }
      return e;
    }
    function parsePrimary(){
      if (at('num')) return {k:'num', v:next().v};
      if (at('chr')) return {k:'num', v:next().v};
      if (at('str')) return {k:'str', v:next().v};
      if (at('kw','true')){ next(); return {k:'num', v:1}; }
      if (at('kw','false')){ next(); return {k:'num', v:0}; }
      if (at('id')) return {k:'var', name:next().v};
      if (at('op','(')){ next(); const e=parseExpr(); eat('op',')'); return e; }
      err(`unexpected '${peek().v}'`);
    }
  }

  /* ---------------- Interpreter ---------------- */
  const BRK={brk:1}, CNT={cnt:1};
  class Ret { constructor(v){ this.v=v; } }

  class Runtime {
    /* hooks: { pinMode(pin,mode), writePin(pin,duty), readPinV(pin)→volts,
               serial(text), error(msg), vcc, adcMax, builtinLed, pwmPins?, inputOnly? } */
    constructor(code, hooks){
      this.hooks = hooks;
      this.globals = Object.create(null);
      this.consts = {
        HIGH:1, LOW:0, OUTPUT:'OUTPUT', INPUT:'INPUT', INPUT_PULLUP:'INPUT_PULLUP',
        LED_BUILTIN:hooks.builtinLed, PI:Math.PI, A0:'A0', A1:'A1', A2:'A2', A3:'A3', A4:'A4', A5:'A5',
      };
      this.t0 = 0; this.now = 0; this.sleepUntil = 0;
      this.running = false; this.crashed = null;
      this.prog = parse(code); // throws SyntaxError with line number
      this.usedDigitalRead = false; this.usedAnalogWrite = false; this.usedAnalogRead = false;
      this.gen = this._main();
    }

    start(nowMs){ this.t0 = nowMs; this.now = nowMs; this.running = true; }

    /* advance up to `budget` interpreter steps; returns false when finished/crashed */
    step(nowMs, budget=4000){
      if (!this.running || this.crashed) return false;
      this.now = nowMs;
      if (nowMs < this.sleepUntil) return true;
      try {
        for (let s=0; s<budget; s++){
          const r = this.gen.next();
          if (r.done){ this.running=false; return false; }
          if (r.value && r.value.sleep !== undefined){
            this.sleepUntil = nowMs + r.value.sleep;
            return true;
          }
          // r.value === tick → keep going within budget
        }
      } catch(e){
        this.crashed = e.message || String(e);
        this.hooks.serial(`\n[runtime error] ${this.crashed}\n`);
        this.running = false;
        return false;
      }
      return true; // budget exhausted this frame; resume next frame
    }

    *_main(){
      const env = { vars:this.globals, parent:null };
      for (const g of this.prog.globals) yield* this._stmt(g, env);
      if (!this.prog.funcs.setup && !this.prog.funcs.loop)
        throw new Error("no setup() or loop() found — every sketch needs 'void setup() {}' and 'void loop() {}'");
      if (this.prog.funcs.setup) yield* this._callUser('setup', [], env);
      if (this.prog.funcs.loop)
        for(;;){
          yield* this._callUser('loop', [], env);
          yield {tick:1};
        }
    }

    *_callUser(name, args, env){
      const f = this.prog.funcs[name];
      const local = { vars:Object.create(null), parent:null };
      f.params.forEach((p,i)=> local.vars[p] = args[i] ?? 0);
      try { yield* this._stmt(f.body, local); }
      catch(e){ if (e instanceof Ret) return e.v; throw e; }
      return 0;
    }

    _lookup(env, name){
      let e = env;
      while (e){ if (name in e.vars) return e.vars; e = e.parent; }
      if (name in this.globals) return this.globals;
      return null;
    }

    *_stmt(s, env){
      switch(s.k){
        case 'block': {
          const scope = { vars:Object.create(null), parent:env };
          for (const st of s.stmts){
            const r = yield* this._stmt(st, scope);
            if (r) return r;
          }
          return;
        }
        case 'decl':
          for (const v of s.vars){
            let val = 0;
            if (v.init){
              if (v.init.k==='arrlit'){ val=[]; for(const it of v.init.items) val.push(yield* this._expr(it, env)); }
              else val = yield* this._expr(v.init, env);
            } else if (v.arr!==null && v.arr!==undefined){
              const n = yield* this._expr(v.arr, env); val = new Array(n|0).fill(0);
            }
            env.vars[v.name] = val;
          }
          return;
        case 'expr': yield* this._expr(s.e, env); return;
        case 'if':
          if (yield* this._expr(s.cond, env)) return yield* this._stmt(s.then, env);
          else if (s.els) return yield* this._stmt(s.els, env);
          return;
        case 'while':
          while (yield* this._expr(s.cond, env)){
            const r = yield* this._stmt(s.body, env);
            if (r===BRK) break;
            if (r && r!==CNT) return r;
            yield {tick:1};
          }
          return;
        case 'for': {
          const scope = { vars:Object.create(null), parent:env };
          if (s.init) yield* this._stmt(s.init.k==='decl'?s.init:s.init, scope);
          while (s.cond ? yield* this._expr(s.cond, scope) : true){
            const r = yield* this._stmt(s.body, scope);
            if (r===BRK) break;
            if (r && r!==CNT) return r;
            if (s.step) yield* this._expr(s.step, scope);
            yield {tick:1};
          }
          return;
        }
        case 'return': throw new Ret(s.e ? yield* this._expr(s.e, env) : 0);
        case 'break': return BRK;
        case 'continue': return CNT;
        case 'empty': return;
      }
    }

    *_expr(e, env){
      switch(e.k){
        case 'num': return e.v;
        case 'str': return e.v;
        case 'var': {
          if (e.name in this.consts) return this.consts[e.name];
          const scope = this._lookup(env, e.name);
          if (!scope) throw new Error(`'${e.name}' is not defined`);
          return scope[e.name];
        }
        case 'bin': {
          const l = yield* this._expr(e.l, env);
          if (e.op==='&&') return l ? ((yield* this._expr(e.r, env))?1:0) : 0;
          if (e.op==='||') return l ? 1 : ((yield* this._expr(e.r, env))?1:0);
          const r = yield* this._expr(e.r, env);
          switch(e.op){
            case '+': return (typeof l==='string'||typeof r==='string') ? String(l)+String(r) : l+r;
            case '-': return l-r; case '*': return l*r;
            case '/': return r===0 ? (()=>{throw new Error('division by zero')})() : ((Number.isInteger(l)&&Number.isInteger(r)) ? Math.trunc(l/r) : l/r);
            case '%': return l%r;
            case '<': return l<r?1:0; case '>': return l>r?1:0; case '<=': return l<=r?1:0; case '>=': return l>=r?1:0;
            case '==': return l==r?1:0; case '!=': return l!=r?1:0;
            case '&': return l&r; case '|': return l|r; case '^': return l^r;
            case '<<': return l<<r; case '>>': return l>>r;
          }
          throw new Error('bad operator '+e.op);
        }
        case 'un': {
          const v = yield* this._expr(e.e, env);
          return e.op==='!'? (v?0:1) : e.op==='-'? -v : e.op==='~'? ~v : +v;
        }
        case 'tern': return (yield* this._expr(e.c, env)) ? yield* this._expr(e.a, env) : yield* this._expr(e.b, env);
        case 'assign': {
          const val = yield* this._expr(e.r, env);
          return yield* this._assignTo(e.l, e.op, val, env);
        }
        case 'preinc': case 'postinc': {
          const cur = yield* this._expr(e.e, env);
          const nv = cur + (e.op==='++'?1:-1);
          yield* this._assignTo(e.e, '=', nv, env);
          return e.k==='preinc' ? nv : cur;
        }
        case 'index': {
          const arr = yield* this._expr(e.obj, env);
          const i = yield* this._expr(e.i, env);
          if (!Array.isArray(arr)) throw new Error('not an array');
          return arr[i|0] ?? 0;
        }
        case 'member': return {__obj: e.obj.k==='var'?e.obj.name:'?', __m: e.m}; // only used as call target
        case 'call': return yield* this._call(e, env);
      }
      throw new Error('bad expression');
    }

    *_assignTo(target, op, val, env){
      const apply = old => op==='='?val : op==='+='?old+val : op==='-='?old-val : op==='*='?old*val
        : op==='/='?old/val : op==='%='?old%val : op==='&='?old&val : old|val;
      if (target.k==='var'){
        let scope = this._lookup(env, target.name);
        if (!scope){ scope = env.vars; scope[target.name]=0; }
        return scope[target.name] = apply(scope[target.name]);
      }
      if (target.k==='index'){
        const arr = yield* this._expr(target.obj, env);
        const i = (yield* this._expr(target.i, env))|0;
        if (!Array.isArray(arr)) throw new Error('not an array');
        return arr[i] = apply(arr[i]??0);
      }
      throw new Error('cannot assign to that');
    }

    *_call(e, env){
      // resolve name (possibly Serial.x)
      let name;
      if (e.target.k==='var') name = e.target.name;
      else if (e.target.k==='member' && e.target.obj.k==='var') name = e.target.obj.name+'.'+e.target.m;
      else throw new Error('cannot call that');

      const args = [];
      for (const a of e.args) args.push(yield* this._expr(a, env));

      if (this.prog.funcs[name]) return yield* this._callUser(name, args, env);

      const H = this.hooks;
      const pinArg = p => p; // pins may be numbers or 'A0' style
      switch(name){
        case 'pinMode': {
          const pin = pinArg(args[0]), mode = args[1];
          if (H.inputOnly && H.inputOnly.includes(pin) && mode==='OUTPUT')
            throw new Error(`GPIO ${pin} is input-only on this board — it can't be an OUTPUT`);
          H.pinMode(pin, mode); return 0;
        }
        case 'digitalWrite': H.writePin(pinArg(args[0]), args[1]?1:0); return 0;
        case 'analogWrite': {
          this.usedAnalogWrite = true;
          const pin = pinArg(args[0]);
          if (H.pwmPins && !H.pwmPins.includes(pin))
            throw new Error(`pin ${pin} doesn't support PWM on this board — use one of: ${H.pwmPins.join(', ')}`);
          H.pinMode(pin, 'OUTPUT');
          H.writePin(pin, Math.max(0,Math.min(255,args[1]))/255);
          return 0;
        }
        case 'digitalRead': this.usedDigitalRead = true; return H.readPinV(pinArg(args[0])) > H.vcc/2 ? 1 : 0;
        case 'analogRead': this.usedAnalogRead = true; return Math.round(Math.max(0,Math.min(1, H.readPinV(pinArg(args[0]))/H.vcc)) * H.adcMax);
        case 'delay': yield {sleep: Math.max(0,args[0])}; return 0;
        case 'delayMicroseconds': yield {sleep: Math.max(0,args[0])/1000}; return 0;
        case 'millis': return Math.round(this.now - this.t0);
        case 'micros': return Math.round((this.now - this.t0)*1000);
        case 'Serial.begin': return 0;
        case 'Serial.print': H.serial(this._fmt(args[0], args[1])); return 0;
        case 'Serial.println': H.serial(this._fmt(args[0], args[1])+'\n'); return 0;
        case 'map': { const [x,a,b,c,d]=args; return Math.round(c + (x-a)*(d-c)/((b-a)||1)); }
        case 'constrain': return Math.min(Math.max(args[0],args[1]),args[2]);
        case 'min': return Math.min(args[0],args[1]);
        case 'max': return Math.max(args[0],args[1]);
        case 'abs': return Math.abs(args[0]);
        case 'pow': return Math.pow(args[0],args[1]);
        case 'sqrt': return Math.sqrt(args[0]);
        case 'sin': return Math.sin(args[0]); case 'cos': return Math.cos(args[0]);
        case 'random': return args.length===1 ? Math.floor(Math.random()*args[0]) : args[0]+Math.floor(Math.random()*(args[1]-args[0]));
        case 'randomSeed': return 0;
        case 'tone': H.pinMode(pinArg(args[0]),'OUTPUT'); H.writePin(pinArg(args[0]), 0.5); return 0;
        case 'noTone': H.writePin(pinArg(args[0]), 0); return 0;
        case 'touchRead': return 50;
      }
      throw new Error(`unknown function '${name}()'`);
    }

    _fmt(v, base){
      if (typeof v === 'number' && base===2) return (v>>>0).toString(2);
      if (typeof v === 'number' && base===16) return v.toString(16).toUpperCase();
      if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(base??2);
      return String(v);
    }
  }

  return { parse, Runtime };
})();
if (typeof module!=='undefined') module.exports = MCU;
