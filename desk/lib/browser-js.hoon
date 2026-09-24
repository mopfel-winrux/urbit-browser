::  browser-js: drive the page runtime under QuickJS on urwasm
::
::    Every entry point is a Lia script over the QuickJS wasm module.
::    Scripts block on host work by yielding [%1 %fetch args]; the agent
::    performs the request with Iris and resumes the seed with the result.
::
/+  wasm=wasm-lia
/*  quick-js-wasm  %wasm  /quick-js-emcc/wasm
/*  runtime-js  %js  /js/browser-runtime/js
=*  cw           coin-wasm:wasm-sur:wasm
=*  lv           lia-value:lia-sur:wasm
=*  script-form  script-raw-form:lia-sur:wasm
=*  yield        script-yield:lia-sur:wasm
|%
+$  acc  [run-u=@ ctx-u=@ fil-u=@ now=@da]
+$  acc-mold  vase
+$  seed  seed:lia-sur:wasm
+$  input  (each (script-form (list lv) vase) (list lv))
+$  outcome  [yil=(yield (list lv)) =seed]
++  arr  (arrows:wasm acc-mold)
::  %gent keeps the jet's suspended wasm3 machine cached across events
::  (the Gall convention); %rand would drop it after every completed step.
++  hint  %gent
::  +discard: run a no-op with the %oust hint so the jet frees the cache
::
++  discard
  |=  sed=seed
  ^-  ~
  =/  m  runnable:wasm
  =/  nop=form:m  (return:m ~)
  =+  (run:wasm &+nop sed %oust)
  ~
::  +fresh: a seed with nothing run yet
::
++  fresh
  ^-  seed
  [quick-js-wasm (return:runnable:wasm ~) ~ imports]
::  +step: run a script or feed a host result into a seed
::
++  step
  |=  [in=input sed=seed gap=@dr]
  ^-  outcome
  =^  [yil=(yield (list lv)) *]  sed
    ?:  =(`@dr`0 gap)  (run:wasm in sed hint)
    ~>(%jinx.gap (run:wasm in sed hint))
  [yil sed]
::  +tem: cord to octs
::
++  tem
  |=  c=cord
  ^-  octs
  [(met 3 c) c]
::  wasm imports
::
++  imports
  ^-  (import:lia-sur:wasm acc-mold)
  :-  !>(*acc)
  =/  m  (script:lia-sur:wasm (list cw) acc-mold)
  %-  ~(gas by *(map (pair cord cord) $-((list cw) form:m)))
  :~  ['wasi_snapshot_preview1'^'clock_time_get' clock-time-get]
      ['wasi_snapshot_preview1'^'environ_sizes_get' environ-sizes-get]
      ['wasi_snapshot_preview1'^'environ_get' ret-zero]
      ['wasi_snapshot_preview1'^'fd_close' ret-zero]
      ['wasi_snapshot_preview1'^'fd_write' fd-write]
      ['wasi_snapshot_preview1'^'fd_seek' ret-zero]
      ['env'^'qts_host_call_function' host-call]
      ['env'^'qts_host_interrupt_handler' ret-zero]
      ['env'^'qts_host_load_module_source' ret-zero]
      ['env'^'qts_host_normalize_module' ret-zero]
      ['env'^'emscripten_notify_memory_growth' ret-nil]
  ==
++  ret-zero
  |=  *
  =/  m  (script:lia-sur:wasm (list cw) acc-mold)
  ^-  form:m
  (return:m i32+0 ~)
++  ret-nil
  |=  *
  =/  m  (script:lia-sur:wasm (list cw) acc-mold)
  ^-  form:m
  (return:m ~)
++  clock-time-get
  |=  args=(pole cw)
  =/  m  (script:lia-sur:wasm (list cw) acc-mold)
  ^-  form:m
  ?>  ?=([[%i32 @] [%i64 @] [%i32 time-u=@] ~] args)
  =,  arr  =,  args
  ;<  tor=acc-mold  try:m  get-acc
  =+  !<(a=acc tor)
  =/  ntime  (mul 1.000.000 (unm:chrono:userlib now.a))
  ;<  ~  try:m  (memwrite time-u 8 ntime)
  (return:m i32+0 ~)
++  environ-sizes-get
  |=  args=(pole cw)
  =/  m  (script:lia-sur:wasm (list cw) acc-mold)
  ^-  form:m
  ?>  ?=([[%i32 count-u=@] [%i32 size-u=@] ~] args)
  =,  arr  =,  args
  ;<  ~  try:m  (memwrite count-u 4 0)
  ;<  ~  try:m  (memwrite size-u 4 0)
  (return:m i32+0 ~)
::  fd_write: QuickJS may print to stderr; report the total and log it
::
++  fd-write
  |=  args=(pole cw)
  =/  m  (script:lia-sur:wasm (list cw) acc-mold)
  ^-  form:m
  ?>  ?=([[%i32 fd=@] [%i32 iovs-u=@] [%i32 iovs-n=@] [%i32 nwritten-u=@] ~] args)
  =,  arr  =,  args
  =|  total=@ud
  =|  i=@ud
  =|  chunks=(list @t)
  |-  ^-  form:m
  ?:  (gte i iovs-n)
    ;<  ~  try:m  (memwrite nwritten-u 4 total)
    ~&  >>  [%quickjs-stdio fd=fd (rap 3 (flop chunks))]
    (return:m i32+0 ~)
  ;<  ptr=octs  try:m  (memread (add iovs-u (mul 8 i)) 4)
  ;<  len=octs  try:m  (memread (add (add iovs-u (mul 8 i)) 4) 4)
  ;<  dat=octs  try:m  (memread q.ptr (min q.len 4.096))
  $(i +(i), total (add total q.len), chunks [q.dat chunks])
::  host functions registered on globalThis: 1 = __host_fetch, 2 = __host_log
::
++  host-call
  |=  args=(pole cw)
  =/  m  (script:lia-sur:wasm (list cw) acc-mold)
  ^-  form:m
  ?>  ?=([[%i32 ctx-u=@] [%i32 this-u=@] [%i32 argc-w=@] [%i32 argv-u=@] [%i32 magic-w=@] ~] args)
  =,  arr  =,  args
  ;<  val-u=@  try:m
    ?:  =(1 magic-w)  (host-fetch ctx-u argc-w argv-u)
    ?:  =(2 magic-w)  (host-log ctx-u argc-w argv-u)
    (throw-error 'unknown host function')
  (return:m i32+val-u ~)
++  host-fetch
  |=  [ctx-u=@ argc-w=@ argv-u=@]
  =/  m  (script:lia-sur:wasm @ acc-mold)
  ^-  form:m
  =,  arr
  ?.  (gte argc-w 4)  (throw-error '__host_fetch needs 4 arguments')
  ;<  url=cord      try:m  (get-js-string argv-u)
  ;<  method=cord   try:m  (get-js-string (add argv-u 8))
  ;<  headers=cord  try:m  (get-js-string (add argv-u 16))
  ;<  body=cord     try:m  (get-js-string (add argv-u 24))
  ;<  kind=cord     try:m
    =/  m  (script:lia-sur:wasm cord acc-mold)
    ?:  (gte argc-w 5)  (get-js-string (add argv-u 32))
    (return:m 'fetch')
  ;<  res=(pole lv)  try:m
    (call-ext %fetch ~[octs+(tem url) octs+(tem method) octs+(tem headers) octs+(tem body) octs+(tem kind)])
  ?>  ?=([[%octs p=octs] ~] res)
  (new-string ctx-u q.p.res)
++  host-log
  |=  [ctx-u=@ argc-w=@ argv-u=@]
  =/  m  (script:lia-sur:wasm @ acc-mold)
  ^-  form:m
  =,  arr
  ?.  (gte argc-w 2)  (throw-error '__host_log needs 2 arguments')
  ;<  level=cord  try:m  (get-js-string argv-u)
  ;<  text=cord   try:m  (get-js-string (add argv-u 8))
  ~&  >  [%page-console level text]
  return-undefined
::  low-level helpers
::
++  ctx
  =/  m  (script:lia-sur:wasm acc acc-mold)
  ^-  form:m
  =,  arr
  ;<  tor=acc-mold  try:m  get-acc
  (return:m !<(acc tor))
++  malloc-write
  |=  data=octs
  =/  m  (script:lia-sur:wasm @ acc-mold)
  ^-  form:m
  =,  arr
  ;<  ptr-u=@  try:m  (call-1 'malloc' p.data ~)
  ;<  ~        try:m  (memwrite ptr-u data)
  (return:m ptr-u)
++  malloc-cord
  |=  str=cord
  =/  m  (script:lia-sur:wasm @ acc-mold)
  ^-  form:m
  (malloc-write +((met 3 str)) str)
::  +new-string: a JSValue* string from a cord
::
++  new-string
  |=  [ctx-u=@ str=cord]
  =/  m  (script:lia-sur:wasm @ acc-mold)
  ^-  form:m
  =,  arr
  ;<  ptr=@    try:m  (malloc-cord str)
  ;<  val-u=@  try:m  (call-1 'QTS_NewString' ctx-u ptr ~)
  ;<  *        try:m  (call 'free' ptr ~)
  (return:m val-u)
::  +js-eval: evaluate code, returning the JSValue* result
::
++  js-eval
  |=  code=cord
  =/  m  (script:lia-sur:wasm @ acc-mold)
  ^-  form:m
  =,  arr
  ;<  a=acc  try:m  ctx
  =/  len  (met 3 code)
  ;<  code-u=@  try:m  (malloc-write +(len) code)
  ;<  res-u=@   try:m  (call-1 'QTS_Eval' ctx-u.a code-u len fil-u.a 0 0 ~)
  ;<  *         try:m  (call 'free' code-u ~)
  (return:m res-u)
++  mayb-error
  |=  res-u=@
  =/  m  (script:lia-sur:wasm (unit cord) acc-mold)
  ^-  form:m
  =,  arr
  ;<  a=acc     try:m  ctx
  ;<  err-u=@   try:m  (call-1 'QTS_ResolveException' ctx-u.a res-u ~)
  ?:  =(0 err-u)  (return:m ~)
  ;<  str-u=@   try:m  (call-1 'QTS_GetString' ctx-u.a err-u ~)
  ;<  str=cord  try:m  (get-c-string str-u)
  ;<  *         try:m  (call 'QTS_FreeCString' ctx-u.a str-u ~)
  (return:m `str)
::  +get-c-string: read a NUL-terminated string in chunks
::
++  get-c-string
  |=  ptr=@
  =/  m  (script:lia-sur:wasm cord acc-mold)
  ^-  form:m
  =,  arr
  ;<  pages=@  try:m  memory-size
  =/  limit  (mul pages page-size:wasm)
  =|  len=@ud
  |-  ^-  form:m
  =/  at  (add ptr len)
  =/  chunk  (min 4.096 ?:((gte at limit) 0 (sub limit at)))
  ?:  =(0 chunk)
    ;<  all=octs  try:m  (memread ptr len)
    (return:m q.all)
  ;<  part=octs  try:m  (memread at chunk)
  =/  nul  (find-nul part)
  ?~  nul  $(len (add len chunk))
  ;<  all=octs  try:m  (memread ptr (add len u.nul))
  (return:m q.all)
++  find-nul
  |=  =octs
  ^-  (unit @ud)
  =/  i  0
  |-  ^-  (unit @ud)
  ?:  (gte i p.octs)  ~
  ?:  =(0 (cut 3 [i 1] q.octs))  `i
  $(i +(i))
++  get-js-string
  |=  val-u=@
  =/  m  (script:lia-sur:wasm cord acc-mold)
  ^-  form:m
  =,  arr
  ;<  a=acc     try:m  ctx
  ;<  str-u=@   try:m  (call-1 'QTS_GetString' ctx-u.a val-u ~)
  ;<  str=cord  try:m  (get-c-string str-u)
  ;<  *         try:m  (call 'QTS_FreeCString' ctx-u.a str-u ~)
  (return:m str)
++  return-undefined
  =/  m  (script:lia-sur:wasm @ acc-mold)
  ^-  form:m
  =,  arr
  ;<  a=acc      try:m  ctx
  ;<  undef-u=@  try:m  (call-1 'QTS_GetUndefined' ~)
  (call-1 'QTS_DupValuePointer' ctx-u.a undef-u ~)
++  throw-error
  |=  err=cord
  =/  m  (script:lia-sur:wasm @ acc-mold)
  ^-  form:m
  =,  arr
  ;<  a=acc    try:m  ctx
  ;<  err-u=@  try:m  (call-1 'QTS_NewError' ctx-u.a ~)
  ;<  key-u=@  try:m  (new-string ctx-u.a 'message')
  ;<  msg-u=@  try:m  (new-string ctx-u.a err)
  ;<  *        try:m  (call 'QTS_SetProp' ctx-u.a err-u key-u msg-u ~)
  (call-1 'QTS_Throw' ctx-u.a err-u ~)
::  +register-function: expose a host function on an object
::
++  register-function
  |=  [name=cord mag-w=@ obj-u=@]
  =/  m  (script:lia-sur:wasm ,~ acc-mold)
  ^-  form:m
  =,  arr
  ;<  a=acc        try:m  ctx
  ;<  nam-u=@      try:m  (malloc-cord name)
  ;<  fun-u=@      try:m  (call-1 'QTS_NewFunction' ctx-u.a mag-w nam-u ~)
  ;<  key-u=@      try:m  (call-1 'QTS_NewString' ctx-u.a nam-u ~)
  ;<  undef-u=@    try:m  (call-1 'QTS_GetUndefined' ~)
  ;<  *  try:m  (call 'QTS_DefineProp' ctx-u.a obj-u key-u fun-u undef-u undef-u 0 0 1 ~)
  ;<  *  try:m  (call 'free' nam-u ~)
  (return:m ~)
::  +set-global: define globalThis[name] = string
::
++  set-global
  |=  [name=cord value=cord]
  =/  m  (script:lia-sur:wasm ,~ acc-mold)
  ^-  form:m
  =,  arr
  ;<  a=acc      try:m  ctx
  ;<  glob-u=@   try:m  (call-1 'QTS_GetGlobalObject' ctx-u.a ~)
  ;<  key-u=@    try:m  (new-string ctx-u.a name)
  ;<  val-u=@    try:m  (new-string ctx-u.a value)
  ;<  undef-u=@  try:m  (call-1 'QTS_GetUndefined' ~)
  ;<  *  try:m  (call 'QTS_DefineProp' ctx-u.a glob-u key-u val-u undef-u undef-u 1 1 1 ~)
  ;<  *  try:m  (call 'QTS_FreeValuePointer' ctx-u.a key-u ~)
  ;<  *  try:m  (call 'QTS_FreeValuePointer' ctx-u.a val-u ~)
  (return:m ~)
::  +eval-string: evaluate code that yields a string; read it by byte length
::
++  eval-string
  |=  code=cord
  =/  m  (script:lia-sur:wasm (each cord cord) acc-mold)
  ^-  form:m
  =,  arr
  ;<  a=acc  try:m  ctx
  =/  wrapped
    (rap 3 'globalThis.__r = (' code '); __browser.bytes(globalThis.__r)' ~)
  ;<  res-u=@          try:m  (js-eval wrapped)
  ;<  err=(unit cord)  try:m  (mayb-error res-u)
  ?^  err  (return:m |+u.err)
  ;<  len-d=@rd  try:m  (call-1 'QTS_GetFloat64' ctx-u.a res-u ~)
  =/  len=@ud  (abs:si (need (toi:rd len-d)))
  ;<  *          try:m  (call 'QTS_FreeValuePointer' ctx-u.a res-u ~)
  ;<  val-u=@    try:m  (js-eval 'globalThis.__r')
  ;<  str-u=@    try:m  (call-1 'QTS_GetString' ctx-u.a val-u ~)
  ;<  =octs      try:m  (memread str-u len)
  ;<  *          try:m  (call 'QTS_FreeCString' ctx-u.a str-u ~)
  ;<  *          try:m  (call 'QTS_FreeValuePointer' ctx-u.a val-u ~)
  ;<  *          try:m  (js-eval 'globalThis.__r = null')
  (return:m &+q.octs)
::  +pump: run pending promise jobs
::
++  pump
  =/  m  (script:lia-sur:wasm ,~ acc-mold)
  ^-  form:m
  =,  arr
  ;<  a=acc     try:m  ctx
  ;<  dump-u=@  try:m  (call-1 'malloc' 4 ~)
  ;<  res-u=@   try:m  (call-1 'QTS_ExecutePendingJob' run-u.a ^~((sub (bex 32) 1)) dump-u ~)
  ;<  *         try:m  (call 'free' dump-u ~)
  ;<  *         try:m  (call 'QTS_FreeValuePointer' ctx-u.a res-u ~)
  (return:m ~)
::  +settle: alternate promise jobs and page timers until quiet
::
++  settle
  =/  m  (script:lia-sur:wasm ,~ acc-mold)
  ^-  form:m
  =,  arr
  ;<  a=acc  try:m  ctx
  =/  i  0
  |-  ^-  form:m
  ;<  *  try:m  pump
  ?:  (gte i 60)  (return:m ~)
  ;<  r=(each cord cord)  try:m  (eval-string '__browser.tick(25)')
  ?:  ?=(%| -.r)  (return:m ~)
  =/  jon  (de:json:html p.r)
  =/  more=?
    ?~  jon  |
    ?.  ?=([%o *] u.jon)  |
    =([~ %b &] (~(get by p.u.jon) 'more'))
  ;<  *  try:m  pump
  ;<  pending=@  try:m  (call-1 'QTS_IsJobPending' run-u.a ~)
  ?:  &(!more =(0 pending))  (return:m ~)
  $(i +(i))
::  scripts (form:runnable): results are [i32 ok] followed by octs payloads
::
++  fail
  |=  msg=cord
  =/  m  runnable:wasm
  ^-  form:m
  (return:m ~[i32+0 octs+(tem msg)])
::  +init: create the runtime and load the bundle (a reusable pristine seed)
::
++  init
  |=  now=@da
  =/  m  runnable:wasm
  ^-  form:m
  =,  arr
  ;<  run-u=@  try:m  (call-1 'QTS_NewRuntime' ~)
  ;<  *        try:m  (call 'QTS_RuntimeSetMemoryLimit' run-u (mul 384 (bex 20)) ~)
  ;<  *        try:m  (call 'QTS_RuntimeSetMaxStackSize' run-u (mul 2 (bex 20)) ~)
  ;<  ctx-u=@  try:m  (call-1 'QTS_NewContext' run-u 0 ~)
  ;<  fil-u=@  try:m  (malloc-cord 'browser-runtime.js')
  ;<  ~        try:m  (set-acc !>(`acc`[run-u ctx-u fil-u now]))
  ;<  glob-u=@  try:m  (call-1 'QTS_GetGlobalObject' ctx-u ~)
  ;<  ~  try:m  (register-function '__host_fetch' 1 glob-u)
  ;<  ~  try:m  (register-function '__host_log' 2 glob-u)
  ;<  res-u=@          try:m  (js-eval runtime-js)
  ;<  err=(unit cord)  try:m  (mayb-error res-u)
  ?^  err  (fail (cat 3 'runtime failed to load: ' u.err))
  ;<  *  try:m  (call 'QTS_FreeValuePointer' ctx-u res-u ~)
  (return:m ~[i32+1])
::  +boot: create the runtime, load the bundle, then load a page
::
++  boot
  |=  [now=@da html=cord url=cord opts=cord]
  =/  m  runnable:wasm
  ^-  form:m
  =,  arr
  ;<  run-u=@  try:m  (call-1 'QTS_NewRuntime' ~)
  ;<  *        try:m  (call 'QTS_RuntimeSetMemoryLimit' run-u (mul 384 (bex 20)) ~)
  ;<  *        try:m  (call 'QTS_RuntimeSetMaxStackSize' run-u (mul 2 (bex 20)) ~)
  ;<  ctx-u=@  try:m  (call-1 'QTS_NewContext' run-u 0 ~)
  ;<  fil-u=@  try:m  (malloc-cord 'browser-runtime.js')
  ;<  ~        try:m  (set-acc !>(`acc`[run-u ctx-u fil-u now]))
  ;<  glob-u=@  try:m  (call-1 'QTS_GetGlobalObject' ctx-u ~)
  ;<  ~  try:m  (register-function '__host_fetch' 1 glob-u)
  ;<  ~  try:m  (register-function '__host_log' 2 glob-u)
  ;<  res-u=@          try:m  (js-eval runtime-js)
  ;<  err=(unit cord)  try:m  (mayb-error res-u)
  ?^  err  (fail (cat 3 'runtime failed to load: ' u.err))
  ;<  *  try:m  (call 'QTS_FreeValuePointer' ctx-u res-u ~)
  (load html url opts)
::  +load: parse a page in the existing runtime and settle it
::
++  load
  |=  [html=cord url=cord opts=cord]
  =/  m  runnable:wasm
  ^-  form:m
  =,  arr
  ;<  ~  try:m  (set-global '__arg0' html)
  ;<  ~  try:m  (set-global '__arg1' url)
  ;<  ~  try:m  (set-global '__arg2' opts)
  ;<  r=(each cord cord)  try:m
    (eval-string '__browser.load(globalThis.__arg0, globalThis.__arg1, globalThis.__arg2)')
  ;<  *  try:m  (js-eval 'globalThis.__arg0 = null')
  ?:  ?=(%| -.r)  (fail (cat 3 'load failed: ' p.r))
  ;<  ~  try:m  settle
  ;<  s=(each cord cord)  try:m  (eval-string '__browser.result("{}")')
  ?:  ?=(%| -.s)  (fail (cat 3 'result failed: ' p.s))
  (return:m ~[i32+1 octs+(tem p.s)])
::  +act: perform an action, settle, and snapshot
::
++  act
  |=  action=cord
  =/  m  runnable:wasm
  ^-  form:m
  =,  arr
  ;<  ~  try:m  (set-global '__arg0' action)
  ;<  r=(each cord cord)  try:m  (eval-string '__browser.act(globalThis.__arg0)')
  ?:  ?=(%| -.r)  (fail (cat 3 'action failed: ' p.r))
  ;<  ~  try:m  settle
  ;<  s=(each cord cord)  try:m  (eval-string '__browser.result("{}")')
  ?:  ?=(%| -.s)  (fail (cat 3 'result failed: ' p.s))
  (return:m ~[i32+1 octs+(tem p.r) octs+(tem p.s)])
::  +query: call a read-only __browser method with two string arguments
::
++  query
  |=  [method=cord arg0=cord arg1=cord]
  =/  m  runnable:wasm
  ^-  form:m
  =,  arr
  ;<  ~  try:m  (set-global '__arg0' arg0)
  ;<  ~  try:m  (set-global '__arg1' arg1)
  ;<  r=(each cord cord)  try:m
    (eval-string (rap 3 '__browser.' method '(globalThis.__arg0, globalThis.__arg1)' ~))
  ?:  ?=(%| -.r)  (fail (cat 3 'query failed: ' p.r))
  (return:m ~[i32+1 octs+(tem p.r)])
--
