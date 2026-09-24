::  browser: a headless browser exposed as an MCP server
::
::    POST /browser/mcp                 JSON-RPC (MCP tools/list, tools/call)
::    GET  /browser/tools               the tool catalog as JSON
::    GET  /browser/view[/<context>]    live viewer (session auth)
::    GET  /browser/files/<ctx>/<name>  a download
::    GET  /browser/export/<context>    context state as JSON
::    scry /x/key                       the API key clients send as x-api-key
::
/-  *browser
/+  default-agent, dbug, verb, server, wasm=wasm-lia,
    url=browser-url, ck=browser-cookie, mcp=browser-mcp, js=browser-js
|%
+$  versioned-state  $%(state-0)
+$  state-0
  $:  %0
      key=@t
      =policy
      contexts=(map context-id context)
      jobs=(map @ud job)
      next-job=@ud
      queue=(map context-id (list @ud))     ::  waiting, oldest first
      active=(map context-id @ud)
      credentials=(map @t credential)       ::  by origin
      pristine=(unit seed:lia-sur:wasm)     ::  runtime with the bundle loaded
      cache=(map @t cached)                 ::  scripts and stylesheets by url
      cache-bytes=@ud
  ==
+$  cached  [when=@da mime=@t body=@t]
+$  job
  $:  eyre-id=@ta
      rpc-id=json
      cid=context-id
      tool=@t
      args=(map @t json)
      started=@da
      hops=@ud
      subrequests=@ud
      js=?
      auth-retried=?
      phase=phase
  ==
+$  phase
  $%  [%queued ~]
      [%fetch url=@t method=@t body=(unit octs) ctype=@t referrer=@t push=? since=@da]
      [%run kind=?(%load %act %query) sub=(unit [url=@t kind=@t since=@da]) push=?]
  ==
+$  card  card:agent:gall
++  default-policy
  ^-  policy
  :*  allow=~
      deny=~
      block-private=&
      :*  'google-analytics.com'  '*.google-analytics.com'  'googletagmanager.com'  '*.googletagmanager.com'
          '*.doubleclick.net'  'doubleclick.net'  'googlesyndication.com'  '*.googlesyndication.com'
          'connect.facebook.net'  '*.facebook.net'  'static.hotjar.com'  '*.hotjar.com'
          'cdn.segment.com'  '*.segment.io'  '*.mixpanel.com'  '*.amplitude.com'  '*.fullstory.com'
          '*.newrelic.com'  'js-agent.newrelic.com'  '*.sentry.io'  'browser.sentry-cdn.com'
          '*.intercom.io'  'widget.intercom.io'  '*.optimizely.com'  '*.adsrvr.org'  '*.criteo.com'
          '*.taboola.com'  '*.outbrain.com'  '*.scorecardresearch.com'  '*.quantserve.com'
          '*.adnxs.com'  '*.rubiconproject.com'  '*.pubmatic.com'  '*.openx.net'  '*.chartbeat.com'
          '*.clarity.ms'  '*.hs-analytics.net'  '*.hs-scripts.com'  '*.crazyegg.com'  '*.matomo.cloud'
          ~
      ==
      block-kinds=~['beacon']
      max-body=(bex 20)
      max-redirects=10
      js=&
      css=&
      js-gap=~s10
      max-script-bytes=(mul 512 1.024)
      max-css-bytes=(mul 512 1.024)
      max-subrequests=40
      cache-scripts=&
      cache-ttl=~h1
      max-cache=(mul 8 (bex 20))
      max-files=(mul 8 (bex 20))
      max-record=200
      page-bytes=5.000
      max-contexts=16
      max-live=4
      idle-expiry=~h6
      timeout=~m2
      user-agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) UrbitBrowser/0.2 Safari/537.36'
      accept-language='en-US,en;q=0.8'
  ==
++  mobile-ua  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 UrbitBrowser/0.2'
++  default-device
  ^-  device
  [1.280 900 | '' '' 'UTC']
++  fresh-context
  |=  now=@da
  ^-  context
  [~ ~ ~ ~ ~ ~ ~ now now default-device ~ ~ ~ ~ 0 0]
--
%-  agent:dbug
%+  verb  |
=|  state-0
=*  state  -
^-  agent:gall
=<
|_  =bowl:gall
+*  this  .
    def   ~(. (default-agent this %.n) bowl)
    hc    ~(. +> bowl)
++  on-init
  ^-  (quip card _this)
  =.  key  make-key:hc
  =.  policy  default-policy
  :_  this
  :~  [%pass /eyre/connect %arvo %e %connect [~ /browser] %browser]
  ==
++  on-save  !>(state)
++  on-load
  |=  old=vase
  ^-  (quip card _this)
  =/  o  !<(versioned-state old)
  ?-  -.o
      %0
    =.  state  o
    ::  a reloaded agent drops live runtimes and in-flight work
    =.  contexts  (~(run by contexts) |=(c=context c(seed ~)))
    =.  jobs  ~
    =.  queue  ~
    =.  active  ~
    =.  pristine  ~
    :_  this
    :~  [%pass /eyre/connect %arvo %e %connect [~ /browser] %browser]
    ==
  ==
++  on-poke
  |=  [=mark =vase]
  ^-  (quip card _this)
  ?+    mark  (on-poke:def mark vase)
      %handle-http-request
    =+  !<([eyre-id=@ta req=inbound-request:eyre] vase)
    =^  cards  state  (handle-http:hc eyre-id req)
    [cards this]
  ::
      ?(%browser-action %noun)
    ?>  =(src.bowl our.bowl)
    =/  act  !<(action vase)
    =^  cards  state  (handle-action:hc act)
    [cards this]
  ==
++  on-watch
  |=  =path
  ^-  (quip card _this)
  ?+  path  (on-watch:def path)
    [%http-response *]  `this
  ==
++  on-leave  on-leave:def
++  on-peek
  |=  =path
  ^-  (unit (unit cage))
  ?+    path  (on-peek:def path)
      [%x %key ~]  ``json+!>(`json`s+key)
      [%x %policy ~]  ``noun+!>(policy)
      [%x %mcp %tools ~]  ``json+!>(tools:mcp)
      [%x %contexts ~]  ``json+!>(contexts-json:hc)
      [%x %credentials ~]
    ``json+!>(`json`a+(turn ~(tap in ~(key by credentials)) |=(o=@t `json`s+o)))
  ::
      [%x %context @ ~]
    =/  c  (~(get by contexts) i.t.t.path)
    ?~  c  ~
    ``json+!>((export-json:hc u.c))
  ::
      [%x %record @ ~]
    =/  c  (~(get by contexts) i.t.t.path)
    ?~  c  ~
    ``json+!>((record-json:hc u.c))
  ==
++  on-agent  on-agent:def
++  on-arvo
  |=  [=wire sign=sign-arvo]
  ^-  (quip card _this)
  ?+    wire  (on-arvo:def wire sign)
      [%eyre %connect ~]  `this
  ::
      [%iris %job @ @ ~]
    ?.  ?=([%iris %http-response *] sign)  (on-arvo:def wire sign)
    =/  jid  (slav %ud i.t.t.wire)
    =/  hop  (slav %ud i.t.t.t.wire)
    =^  cards  state  (handle-response:hc jid hop client-response.sign)
    [cards this]
  ::
      [%behn %timeout @ ~]
    ?.  ?=([%behn %wake *] sign)  (on-arvo:def wire sign)
    =/  jid  (slav %ud i.t.t.wire)
    =^  cards  state  (handle-timeout:hc jid)
    [cards this]
  ==
++  on-fail   on-fail:def
--
::
|_  =bowl:gall
+*  this  .
++  make-key
  ^-  @t
  (scot %uv (end [3 20] (shax (jam [eny.bowl now.bowl]))))
++  cass-cord  |=(c=@t (crip (cass (trip c))))
::  +drop-seed: free a context's live runtime (and the jet's cached machine)
::
++  drop-seed
  |=  c=context
  ^-  context
  ?~  seed.c  c
  =/  freed  (discard:js u.seed.c)
  ?>  ?=(~ freed)
  c(seed ~)
++  norm-origin
  |=  o=@t
  ^-  @t
  =/  p  (split:url o)
  ?~  p  (cass-cord o)
  (origin:url u.p)
++  clip
  |=  t=@t
  ^-  @t
  ?:  (lte (met 3 t) 160)  t
  (cat 3 (end [3 157] t) '...')
++  head-of  |*(l=(list) ?~(l ~ `i.l))
++  tail-of  |*(l=(list) ?~(l ~ `t.l))
++  jstr  |=([m=(map @t json) k=@t] ^-(@t =/(v (~(get by m) k) ?:(?=([~ %s *] v) p.u.v ''))))
++  jnum  |=([m=(map @t json) k=@t] ^-(@ud =/(v (~(get by m) k) ?:(?=([~ %n *] v) (fall (rush p.u.v dem) 0) 0))))
++  jbool  |=([m=(map @t json) k=@t d=?] ^-(? =/(v (~(get by m) k) ?:(?=([~ %b *] v) p.u.v d))))
++  jlines
  |=  [m=(map @t json) k=@t]
  ^-  (list @t)
  =/  v  (~(get by m) k)
  ?.  ?=([~ %a *] v)  ~
  (murn p.u.v |=(j=json ?:(?=([%s *] j) `p.j ~)))
++  jmap
  |=  [m=(map @t json) k=@t]
  ^-  (unit (map @t @t))
  =/  v  (~(get by m) k)
  ?.  ?=([~ %o *] v)  ~
  `(~(run by p.u.v) |=(j=json ?:(?=([%s *] j) p.j '')))
++  jobj  |=([m=(map @t json) k=@t] ^-((map @t json) =/(v (~(get by m) k) ?:(?=([~ %o *] v) p.u.v ~))))
++  ms-since  |=(t=@da ^-(@ud (div (mul 1.000 (sub now.bowl t)) ~s1)))
++  unix-ms
  |=  t=@da
  ^-  @ud
  ?:  (lth t ~1970.1.1)  0
  (div (mul 1.000 (sub t ~1970.1.1)) ~s1)
::  JSON views
::
++  cookie-json
  |=  c=cookie
  ^-  json
  %-  pairs:enjs:format
  :~  ['name' s+name.c]  ['value' s+value.c]  ['domain' s+domain.c]  ['path' s+path.c]
      ['secure' b+secure.c]  ['httpOnly' b+http-only.c]  ['hostOnly' b+host-only.c]
      ['expires' ?~(expires.c ~ (numb:enjs:format (unix-ms u.expires.c)))]
  ==
++  json-cookie
  |=  j=json
  ^-  (unit cookie)
  ?.  ?=([%o *] j)  ~
  =/  m  p.j
  ?:  |(=('' (jstr m 'name')) =('' (jstr m 'domain')))  ~
  =/  exp=(unit @da)
    =/  v  (~(get by m) 'expires')
    ?.  ?=([~ %n *] v)  ~
    =/  ms  (fall (rush p.u.v dem) 0)
    ?:  =(0 ms)  ~
    `(add ~1970.1.1 (div (mul ms ~s1) 1.000))
  :-  ~
  :*  (jstr m 'name')  (jstr m 'value')  (jstr m 'domain')  ?:(=('' (jstr m 'path')) '/' (jstr m 'path'))
      (jbool m 'secure' |)  (jbool m 'httpOnly' |)  (jbool m 'hostOnly' &)  exp
  ==
++  device-json
  |=  d=device
  ^-  json
  %-  pairs:enjs:format
  :~  ['width' (numb:enjs:format width.d)]  ['height' (numb:enjs:format height.d)]  ['mobile' b+mobile.d]
      ['userAgent' s+user-agent.d]  ['locale' s+locale.d]  ['timezone' s+timezone.d]
  ==
++  json-device
  |=  [base=device m=(map @t json)]
  ^-  device
  :*  ?:(=(0 (jnum m 'width')) width.base (jnum m 'width'))
      ?:(=(0 (jnum m 'height')) height.base (jnum m 'height'))
      (jbool m 'mobile' mobile.base)
      ?:(=('' (jstr m 'userAgent')) user-agent.base (jstr m 'userAgent'))
      ?:(=('' (jstr m 'locale')) locale.base (jstr m 'locale'))
      ?:(=('' (jstr m 'timezone')) timezone.base (jstr m 'timezone'))
  ==
++  export-json
  |=  c=context
  ^-  json
  %-  pairs:enjs:format
  :~  ['cookies' a+(turn cookies.c cookie-json)]
      ['localStorage' o+(~(run by local-storage.c) |=(v=@t `json`s+v))]
      ['sessionStorage' o+(~(run by session-storage.c) |=(v=@t `json`s+v))]
      ['history' a+(turn (flop back.c) |=(u=@t `json`s+u))]
      ['device' (device-json device.c)]
      ['proxy' ?~(proxy.c ~ s+u.proxy.c)]
      ['url' s+?~(page.c '' url.u.page.c)]
  ==
++  import-state
  |=  [c=context j=json]
  ^-  context
  ?.  ?=([%o *] j)  c
  =/  m  p.j
  =/  cookies
    =/  v  (~(get by m) 'cookies')
    ?.  ?=([~ %a *] v)  cookies.c
    (murn p.u.v json-cookie)
  =/  history=(list @t)  (flop (jlines m 'history'))
  =/  dev  ?:(?=(^ (~(get by m) 'device')) (json-device device.c (jobj m 'device')) device.c)
  %=  c
    cookies  cookies
    local-storage  (fall (jmap m 'localStorage') local-storage.c)
    session-storage  (fall (jmap m 'sessionStorage') session-storage.c)
    back  ?:(=(~ history) back.c history)
    device  dev
    proxy  ?:(=('' (jstr m 'proxy')) proxy.c `(jstr m 'proxy'))
  ==
++  record-json
  |=  c=context
  ^-  json
  :-  %a
  %+  turn  record.c
  |=  e=event
  (pairs:enjs:format ~[['at' (sect:enjs:format when.e)] ['kind' s+kind.e] ['detail' s+detail.e]])
++  contexts-json
  ^-  json
  :-  %a
  %+  turn  ~(tap by contexts)
  |=  [id=context-id c=context]
  %-  pairs:enjs:format
  :~  ['id' s+id]
      ['url' s+?~(page.c '' url.u.page.c)]
      ['title' s+?~(page.c '' title.u.page.c)]
      ['cookies' (numb:enjs:format (lent cookies.c))]
      ['live' b+?=(^ seed.c)]
      ['last' (sect:enjs:format last.c)]
      ['created' (sect:enjs:format created.c)]
      ['history' (numb:enjs:format (lent back.c))]
      ['events' (numb:enjs:format events.c)]
      ['files' (numb:enjs:format ~(wyt by files.c))]
      ['busy' b+(~(has by active) id)]
      ['device' (device-json device.c)]
      ['timeout' (numb:enjs:format (div (fall timeout.c timeout.policy) ~s1))]
  ==
::  +note: append to a context's recording
::
++  note
  |=  [cid=context-id kind=@t detail=@t]
  ^+  state
  =/  c  (~(get by contexts) cid)
  ?~  c  state
  =.  record.u.c  (scag max-record.policy `(list event)`[[now.bowl kind (clip detail)] record.u.c])
  =.  events.u.c  +(events.u.c)
  state(contexts (~(put by contexts) cid u.c))
::  +handle-action: operator pokes
::
++  handle-action
  |=  act=action
  ^-  (quip card _state)
  ?-    -.act
      %set-policy  `state(policy policy.act)
      %rotate-key  `state(key make-key)
      %close-all
    =.  contexts  (~(run by contexts) drop-seed)
    `state(contexts ~, queue ~, active ~, jobs ~)
  ::
      %close-context
    =/  c  (~(get by contexts) id.act)
    ?~  c  `state
    =+  (drop-seed u.c)
    `state(contexts (~(del by contexts) id.act))
      %clear-cache  `state(cache ~, cache-bytes 0)
      %set-credential  `state(credentials (~(put by credentials) (norm-origin origin.credential.act) credential.act))
      %del-credential  `state(credentials (~(del by credentials) (norm-origin origin.act)))
      %clear-cookies
    =/  c  (~(get by contexts) id.act)
    ?~  c  `state
    `state(contexts (~(put by contexts) id.act u.c(cookies ~)))
  ::
      %set-cookie
    =/  c  (fall (~(get by contexts) id.act) (fresh-context now.bowl))
    =.  cookies.c  (store:ck cookies.c cookie.act now.bowl)
    `state(contexts (~(put by contexts) id.act c))
  ::
      %drop-runtime
    =/  c  (~(get by contexts) id.act)
    ?~  c  `state
    `state(contexts (~(put by contexts) id.act (drop-seed u.c)))
  ::
      %set-proxy
    =/  c  (fall (~(get by contexts) id.act) (fresh-context now.bowl))
    `state(contexts (~(put by contexts) id.act c(proxy proxy.act)))
  ::
      %set-device
    =/  c  (fall (~(get by contexts) id.act) (fresh-context now.bowl))
    `state(contexts (~(put by contexts) id.act c(device device.act)))
  ::
      %import-context
    =/  c  (fall (~(get by contexts) id.act) (fresh-context now.bowl))
    `state(contexts (~(put by contexts) id.act (import-state c state.act)))
  ==
::  +handle-http: Eyre requests
::
++  handle-http
  |=  [eyre-id=@ta req=inbound-request:eyre]
  ^-  (quip card _state)
  =/  =request:http  request.req
  =/  path=(list @t)  (path-of url.request)
  ?.  (authed req)
    :_  state
    (respond-json eyre-id 401 (pairs:enjs:format ~[['error' s+'unauthorized: send x-api-key or an authenticated session']]))
  ?+    path
    :_  state
    (respond-json eyre-id 404 (pairs:enjs:format ~[['error' s+'not found']]))
  ::
      [%browser %tools ~]
    :_  state
    (respond-json eyre-id 200 (pairs:enjs:format ~[['tools' tools:mcp]]))
  ::
      [%browser %export @ ~]
    =/  c  (~(get by contexts) (de-seg i.t.t.path))
    ?~  c  :_(state (respond-json eyre-id 404 (pairs:enjs:format ~[['error' s+'no such context']])))
    :_  state  (respond-json eyre-id 200 (export-json u.c))
  ::
      [%browser %files @ @ ~]
    =/  c  (~(get by contexts) (de-seg i.t.t.path))
    ?~  c  :_(state (respond-json eyre-id 404 (pairs:enjs:format ~[['error' s+'no such context']])))
    =/  f  (~(get by files.u.c) (de-seg i.t.t.t.path))
    ?~  f  :_(state (respond-json eyre-id 404 (pairs:enjs:format ~[['error' s+'no such file']])))
    :_  state
    %+  give-simple-payload:app:server  eyre-id
    [[200 ~[['content-type' mime.u.f] ['content-disposition' (rap 3 'attachment; filename="' (de-seg i.t.t.t.path) '"' ~)]]] `data.u.f]
  ::
      [%browser %view ~]
    :_  state  (respond-html eyre-id view-index)
  ::
      [%browser %view @ ~]
    =/  cid  (de-seg i.t.t.path)
    =/  c  (~(get by contexts) cid)
    ?~  c  :_(state (respond-html eyre-id view-index))
    :_  state  (respond-html eyre-id (view-context cid u.c))
  ::
      [%browser %mcp ~]
    ?.  =(%'POST' method.request)
      :_  state
      (respond-json eyre-id 405 (pairs:enjs:format ~[['error' s+'MCP endpoint accepts POST only; no SSE stream']]))
    =/  jon=(unit json)
      ?~  body.request  ~
      (de:json:html q.u.body.request)
    ?~  jon
      :_  state
      (respond-json eyre-id 400 (error:mcp ~ 32.700 'parse error'))
    ?:  ?=([%a *] u.jon)
      :_  state
      (respond-json eyre-id 400 (error:mcp ~ 32.600 'batch requests are not supported'))
    ?.  ?=([%o *] u.jon)
      :_  state
      (respond-json eyre-id 400 (error:mcp ~ 32.600 'invalid request'))
    =/  id=json  (fall (~(get by p.u.jon) 'id') ~)
    =/  method=@t
      =/  m  (~(get by p.u.jon) 'method')
      ?:(?=([~ %s *] m) p.u.m '')
    =/  params=(map @t json)
      =/  p  (~(get by p.u.jon) 'params')
      ?:(?=([~ %o *] p) p.u.p ~)
    (handle-rpc eyre-id id method params)
  ==
++  de-seg  |=(s=@t ^-(@t (crip (fall (de-urlt:html (trip s)) (trip s)))))
++  path-of
  |=  url=@t
  ^-  (list @t)
  =/  tap  (trip url)
  =/  q  (find "?" tap)
  =/  clean  ?~(q tap (scag u.q tap))
  =|  cur=tape
  =|  out=(list @t)
  |-  ^-  (list @t)
  ?~  clean  (flop ?~(cur out [(crip (flop cur)) out]))
  ?:  =('/' i.clean)  $(clean t.clean, out ?~(cur out [(crip (flop cur)) out]), cur ~)
  $(clean t.clean, cur [i.clean cur])
++  authed
  |=  req=inbound-request:eyre
  ^-  ?
  ?:  authenticated.req  &
  =/  hs  header-list.request.req
  =/  k  (get-header:http 'x-api-key' hs)
  ?:  &(?=(^ k) =(u.k key))  &
  =/  a  (get-header:http 'authorization' hs)
  ?~  a  |
  =((rap 3 'Bearer ' key ~) u.a)
++  respond-json
  |=  [eyre-id=@ta status=@ud jon=json]
  ^-  (list card)
  %+  give-simple-payload:app:server  eyre-id
  :-  [status ~[['content-type' 'application/json'] ['cache-control' 'no-store']]]
  `(as-octs:mimes:html (en:json:html jon))
++  respond-html
  |=  [eyre-id=@ta markup=@t]
  ^-  (list card)
  %+  give-simple-payload:app:server  eyre-id
  :-  [200 ~[['content-type' 'text/html; charset=utf-8'] ['cache-control' 'no-store']]]
  `(as-octs:mimes:html markup)
++  respond-empty
  |=  [eyre-id=@ta status=@ud]
  ^-  (list card)
  (give-simple-payload:app:server eyre-id [[status ~] ~])
::  viewer pages
::
++  esc
  |=  t=@t
  ^-  @t
  %-  crip
  %-  zing
  %+  turn  (trip t)
  |=  c=@tD
  ^-  tape
  ?:  =(c '<')  "&lt;"
  ?:  =(c '>')  "&gt;"
  ?:  =(c '&')  "&amp;"
  ?:  =(c '"')  "&quot;"
  [c ~]
++  view-shell
  |=  [title=@t body=@t]
  ^-  @t
  %+  rap  3
  :~  '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>'
      (esc title)
      '</title><style>body{font:14px/1.45 ui-monospace,Menlo,monospace;margin:20px;color:#222;background:#fafafa}pre{white-space:pre-wrap;background:#fff;border:1px solid #ddd;padding:10px;border-radius:6px}h1,h2{font-size:16px}a{color:#0969da}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:3px 8px;text-align:left}</style></head><body>'
      body
      '</body></html>'
  ==
++  view-index
  ^-  @t
  %+  view-shell  'browser contexts'
  %+  rap  3
  :~  '<h1>%browser contexts</h1><table><tr><th>context</th><th>page</th><th>cookies</th><th>events</th><th>files</th><th>live</th><th>last</th></tr>'
      %+  rap  3
      %+  turn  ~(tap by contexts)
      |=  [id=context-id c=context]
      %+  rap  3
      :~  '<tr><td><a href="/browser/view/'  (esc id)  '">'  (esc id)  '</a></td><td>'
          (esc ?~(page.c '' (clip url.u.page.c)))  '</td><td>'  (scot %ud (lent cookies.c))  '</td><td>'
          (scot %ud events.c)  '</td><td>'  (scot %ud ~(wyt by files.c))  '</td><td>'  ?:(?=(^ seed.c) 'yes' 'no')
          '</td><td>'  (scot %da last.c)  '</td></tr>'
      ==
      '</table><p>Refreshes every 5 seconds.</p>'
  ==
++  view-context
  |=  [cid=context-id c=context]
  ^-  @t
  %+  view-shell  (cat 3 'context ' cid)
  %+  rap  3
  :~  '<p><a href="/browser/view">all contexts</a></p><h1>'  (esc cid)  '</h1>'
      ?~  page.c  '<p>No page loaded.</p>'
      %+  rap  3
      :~  '<h2>'  (esc title.u.page.c)  '</h2><p><a href="'  (esc url.u.page.c)  '">'  (esc url.u.page.c)
          '</a> (HTTP '  (scot %ud status.u.page.c)  ', '  (scot %ud interactive.u.page.c)  ' interactive)</p><pre>'
          (esc (rap 3 (join '\0a' lines.u.page.c)))  '</pre>'
      ==
      '<h2>files</h2><ul>'
      %+  rap  3
      %+  turn  ~(tap by files.c)
      |=  [name=@t f=file]
      (rap 3 '<li><a href="/browser/files/' (esc cid) '/' (esc name) '">' (esc name) '</a> ' (esc mime.f) ' ' (scot %ud size.f) ' bytes</li>' ~)
      '</ul><h2>log (newest first)</h2><pre>'
      %+  rap  3
      %+  turn  record.c
      |=  e=event
      (rap 3 (esc (scot %da when.e)) '  ' (esc kind.e) '  ' (esc detail.e) '\0a' ~)
      '</pre>'
  ==
::  +handle-rpc: MCP methods
::
++  handle-rpc
  |=  [eyre-id=@ta id=json method=@t params=(map @t json)]
  ^-  (quip card _state)
  ?+    method
    :_  state
    (respond-json eyre-id 200 (error:mcp id 32.601 (cat 3 'method not found: ' method)))
  ::
      %'initialize'
    :_  state  (respond-json eyre-id 200 (initialize:mcp id our.bowl))
  ::
      %'notifications/initialized'
    :_  state  (respond-empty eyre-id 202)
  ::
      %'notifications/cancelled'
    :_  state  (respond-empty eyre-id 202)
  ::
      %'ping'
    :_  state  (respond-json eyre-id 200 (result:mcp id (pairs:enjs:format ~)))
  ::
      %'tools/list'
    :_  state
    (respond-json eyre-id 200 (result:mcp id (pairs:enjs:format ~[['tools' tools:mcp]])))
  ::
      %'tools/call'
    =/  name=@t
      =/  n  (~(get by params) 'name')
      ?:(?=([~ %s *] n) p.u.n '')
    =/  args=(map @t json)
      =/  a  (~(get by params) 'arguments')
      ?:(?=([~ %o *] a) p.u.a ~)
    (call-tool eyre-id id name args)
  ==
::  +call-tool: admit a tool call as a job on its context
::
++  call-tool
  |=  [eyre-id=@ta id=json name=@t args=(map @t json)]
  ^-  (quip card _state)
  =/  cid=context-id
    =/  c  (~(get by args) 'context')
    ?:  &(?=([~ %s *] c) !=('' p.u.c))  p.u.c
    'default'
  ?.  (known-tool name)
    :_  state
    (respond-json eyre-id 200 (error:mcp id 32.602 (cat 3 'unknown tool: ' name)))
  ::  bookkeeping tools never wait on a context
  ?:  =('browser_contexts' name)  (tool-contexts eyre-id id args)
  ?:  =('browser_files' name)  (tool-files eyre-id id cid args)
  ?:  =('browser_log' name)  (tool-log eyre-id id cid args)
  =.  state  (expire-contexts now.bowl)
  ?:  &(!(~(has by contexts) cid) (gte ~(wyt by contexts) max-contexts.policy))
    :_  state
    (respond-json eyre-id 200 (text-result:mcp id 'too many contexts; close one with browser_contexts' &))
  =?  contexts  !(~(has by contexts) cid)
    (~(put by contexts) cid (fresh-context now.bowl))
  =/  js=?
    =/  j  (~(get by args) 'js')
    ?:(?=([~ %b *] j) p.u.j js.policy)
  =/  jid  next-job
  =/  =job  [eyre-id id cid name args now.bowl 0 0 js | [%queued ~]]
  =.  next-job  +(next-job)
  =.  jobs  (~(put by jobs) jid job)
  =/  c  (~(got by contexts) cid)
  =/  timer  [%pass /behn/timeout/(scot %ud jid) %arvo %b %wait (add now.bowl (fall timeout.c timeout.policy))]
  ?:  (~(has by active) cid)
    =.  queue  (~(put by queue) cid (snoc (fall (~(get by queue) cid) ~) jid))
    [~[timer] state]
  =^  cards  state  (start-job jid)
  [[timer cards] state]
++  known-tool
  |=  name=@t
  ^-  ?
  ?=  $?  %'browser_navigate'  %'browser_snapshot'  %'browser_click'  %'browser_type'
          %'browser_select'  %'browser_press'  %'browser_hover'  %'browser_submit'
          %'browser_text'  %'browser_find'  %'browser_links'  %'browser_html'
          %'browser_eval'  %'browser_wait'  %'browser_back'  %'browser_contexts'
          %'browser_login'  %'browser_upload'  %'browser_metadata'  %'browser_files'  %'browser_log'
      ==
    name
::  +expire-contexts: drop idle contexts, and idle runtimes beyond max-live
::
++  expire-contexts
  |=  now=@da
  ^+  state
  =/  expired
    %+  skim  ~(tap by contexts)
    |=  [id=context-id c=context]
    ?&  !(~(has by active) id)
        (lth (add last.c idle-expiry.policy) now)
    ==
  =+  (turn expired |=([id=context-id c=context] (drop-seed c)))
  =.  contexts
    %-  ~(gas by *(map context-id context))
    (skip ~(tap by contexts) |=([id=context-id c=context] (lien expired |=([i=context-id *] =(i id)))))
  =/  live=(list [id=context-id c=context])
    %+  sort
      (skim ~(tap by contexts) |=([id=context-id c=context] ?=(^ seed.c)))
    |=([a=[id=context-id c=context] b=[id=context-id c=context]] (gth last.c.a last.c.b))
  =/  excess  (slag max-live.policy live)
  =.  contexts
    %+  roll  excess
    |=  [[id=context-id c=context] acc=_contexts]
    ?:  (~(has by active) id)  acc
    (~(put by acc) id (drop-seed c))
  state
::  +start-job: begin executing a job on its (idle) context
::
++  start-job
  |=  jid=@ud
  ^-  (quip card _state)
  =/  =job  (~(got by jobs) jid)
  =.  active  (~(put by active) cid.job jid)
  =/  c  (~(got by contexts) cid.job)
  =.  contexts  (~(put by contexts) cid.job c(last now.bowl))
  =/  tool  tool.job
  =/  str  |=(k=@t ^-(@t (jstr args.job k)))
  =/  num  |=(k=@t ^-(@ud (jnum args.job k)))
  =/  boo  |=([k=@t d=?] ^-(? (jbool args.job k d)))
  =/  no-page  'no page loaded in this context; call browser_navigate first'
  =/  no-live  'no live page in this context; call browser_navigate first'
  =/  opt-obj
    |=  keys=(list @t)
    ^-  json
    (pairs:enjs:format (murn keys |=(k=@t ?:(=('' (str k)) ~ `[k `json`s+(str k)]))))
  ?+    tool  (finish-error jid 'unknown tool')
      %'browser_navigate'
    =.  state  (note cid.job 'navigate' (str 'url'))
    (begin-fetch jid (str 'url') 'GET' ~ '' (str 'referrer') & ~)
  ::
      %'browser_back'
    =/  forward  =('forward' (str 'direction'))
    =/  target=(unit @t)
      ?:  forward  ?~(forward.c ~ `i.forward.c)
      ?~  back.c  ~
      ?~  t.back.c  ~
      `i.t.back.c
    ?~  target  (finish-error jid ?:(forward 'nothing to go forward to' 'nothing to go back to'))
    =.  c
      ?:  forward
        c(back [u.target back.c], forward (fall (tail-of forward.c) ~))
      c(forward [(fall (head-of back.c) '') forward.c], back (fall (tail-of back.c) ~))
    =.  contexts  (~(put by contexts) cid.job c)
    =.  state  (note cid.job ?:(forward 'forward' 'back') u.target)
    (begin-fetch jid u.target 'GET' ~ '' '' | ~)
  ::
      %'browser_snapshot'
    ?~  page.c  (finish-error jid no-page)
    =/  selector  (str 'selector')
    ?:  &(?=(^ seed.c) !=('' selector))
      (run-script jid %query (query:js 'snapshot' (en:json:html (opt-obj ~['selector'])) ''))
    (finish-text jid (render-page c u.page.c (max 1 (num 'page')) ~) |)
  ::
      %'browser_text'
    ?~  page.c  (finish-error jid no-page)
    ?~  seed.c
      =/  r  (page-text:mcp text.u.page.c (max 1 (num 'page')) page-bytes.policy)
      (finish-text jid (rap 3 (page-header u.page.c) 'Text page ' (scot %ud page.r) '/' (scot %ud pages.r) '\0a---\0a' body.r ~) |)
    (run-script jid %query (query:js 'text' (en:json:html (opt-obj ~['ref' 'selector'])) ''))
  ::
      %'browser_metadata'
    ?~  seed.c  (finish-error jid no-live)
    (run-script jid %query (query:js 'metadata' '' ''))
  ::
      %'browser_find'
    ?~  seed.c  (finish-error jid no-live)
    (run-script jid %query (query:js 'find' (str 'query') '{}'))
  ::
      %'browser_links'
    ?~  seed.c  (finish-error jid no-live)
    (run-script jid %query (query:js 'links' (en:json:html (opt-obj ~['filter'])) ''))
  ::
      %'browser_html'
    ?~  seed.c  (finish-error jid no-live)
    =/  opts  (pairs:enjs:format (weld (murn ~['ref' 'selector'] |=(k=@t ?:(=('' (str k)) ~ `[k `json`s+(str k)]))) ~[['clean' `json`b+(boo 'clean' |)]]))
    (run-script jid %query (query:js 'html' (en:json:html opts) ''))
  ::
      %'browser_eval'
    ?.  js.policy  (finish-error jid 'JavaScript is disabled by policy')
    ?~  seed.c  (finish-error jid no-live)
    (run-action jid (pairs:enjs:format ~[['type' s+'eval'] ['code' s+(str 'code')]]))
  ::
      %'browser_click'
    ?~  seed.c  (finish-error jid no-live)
    (run-action jid (pairs:enjs:format ~[['type' s+'click'] ['ref' s+(str 'ref')]]))
  ::
      %'browser_type'
    ?~  seed.c  (finish-error jid no-live)
    (run-action jid (pairs:enjs:format ~[['type' s+'type'] ['ref' s+(str 'ref')] ['text' s+(str 'text')] ['submit' b+(boo 'submit' |)] ['clear' b+(boo 'clear' &)]]))
  ::
      %'browser_select'
    ?~  seed.c  (finish-error jid no-live)
    (run-action jid (pairs:enjs:format ~[['type' s+'select'] ['ref' s+(str 'ref')] ['value' s+(str 'value')]]))
  ::
      %'browser_press'
    ?~  seed.c  (finish-error jid no-live)
    (run-action jid (pairs:enjs:format ~[['type' s+'press'] ['key' s+(str 'key')] ['ref' s+(str 'ref')] ['shift' b+(boo 'shift' |)]]))
  ::
      %'browser_hover'
    ?~  seed.c  (finish-error jid no-live)
    (run-action jid (pairs:enjs:format ~[['type' s+'hover'] ['ref' s+(str 'ref')]]))
  ::
      %'browser_submit'
    ?~  seed.c  (finish-error jid no-live)
    (run-action jid (pairs:enjs:format ~[['type' s+'submit'] ['ref' s+(str 'ref')]]))
  ::
      %'browser_wait'
    ?~  seed.c  (finish-error jid no-live)
    =/  ms  ?:(=(0 (num 'ms')) 3.000 (min 30.000 (num 'ms')))
    (run-action jid (pairs:enjs:format ~[['type' s+'wait'] ['ms' (numb:enjs:format ms)] ['selector' s+(str 'selector')] ['text' s+(str 'text')]]))
  ::
      %'browser_upload'
    ?~  seed.c  (finish-error jid no-live)
    ?:  =('' (str 'name'))  (finish-error jid 'name is required')
    =/  f  (pairs:enjs:format ~[['name' s+(str 'name')] ['type' s+?:(=('' (str 'type')) 'text/plain' (str 'type'))] ['content' s+(str 'content')]])
    (run-action jid (pairs:enjs:format ~[['type' s+'upload'] ['ref' s+(str 'ref')] ['files' a+~[f]]]))
  ::
      %'browser_login'
    ?~  seed.c  (finish-error jid no-live)
    ?~  page.c  (finish-error jid no-page)
    =/  origin=@t
      ?.  =('' (str 'origin'))  (norm-origin (str 'origin'))
      =/  p  (split:url url.u.page.c)
      ?~(p '' (origin:url u.p))
    =/  cred  (~(get by credentials) origin)
    ?~  cred  (finish-error jid (rap 3 'no stored credential for ' origin '; the ship operator adds one with a %set-credential poke' ~))
    =.  state  (note cid.job 'login' origin)
    (run-action jid (pairs:enjs:format ~[['type' s+'login'] ['username' s+username.u.cred] ['password' s+password.u.cred] ['ref' s+(str 'ref')] ['submit' b+&]]))
  ==
::  bookkeeping tools
::
++  tool-contexts
  |=  [eyre-id=@ta id=json args=(map @t json)]
  ^-  (quip card _state)
  =/  act  =/(a (~(get by args) 'action') ?:(?=([~ %s *] a) p.u.a 'list'))
  =/  cid  (jstr args 'context')
  =/  ok  |=(t=@t ^-((list card) (respond-json eyre-id 200 (text-result:mcp id t |))))
  =/  bad  |=(t=@t ^-((list card) (respond-json eyre-id 200 (text-result:mcp id t &))))
  ?:  =('list' act)  [(ok (en:json:html contexts-json)) state]
  ?:  =('' cid)  [(bad 'context is required') state]
  ?:  =('close' act)
    =/  old  (~(get by contexts) cid)
    =+  ?~(old ~ (drop-seed u.old))
    =.  contexts  (~(del by contexts) cid)
    =.  queue  (~(del by queue) cid)
    [(ok (rap 3 'closed context ' cid ~)) state]
  =/  c=(unit context)  (~(get by contexts) cid)
  ?:  =('import' act)
    =/  st  (de:json:html (jstr args 'state'))
    ?~  st  [(bad 'state must be the JSON produced by export') state]
    =/  base  (fall c (fresh-context now.bowl))
    =.  contexts  (~(put by contexts) cid (import-state base u.st))
    [(ok (rap 3 'imported state into ' cid ~)) state]
  =?  c  &(?=(~ c) =('configure' act))  `(fresh-context now.bowl)
  ?~  c  [(bad 'no such context') state]
  ?:  =('clear-cookies' act)
    =.  contexts  (~(put by contexts) cid u.c(cookies ~))
    [(ok (rap 3 'cleared cookies of ' cid ~)) state]
  ?:  =('export' act)  [(ok (en:json:html (export-json u.c))) state]
  ?:  =('configure' act)
    =/  dev  device.u.c
    =.  width.dev  ?:(=(0 (jnum args 'width')) width.dev (jnum args 'width'))
    =.  height.dev  ?:(=(0 (jnum args 'height')) height.dev (jnum args 'height'))
    =.  mobile.dev  (jbool args 'mobile' mobile.dev)
    =.  user-agent.dev  ?:(=('' (jstr args 'user_agent')) user-agent.dev (jstr args 'user_agent'))
    =.  locale.dev  ?:(=('' (jstr args 'locale')) locale.dev (jstr args 'locale'))
    =.  timezone.dev  ?:(=('' (jstr args 'timezone')) timezone.dev (jstr args 'timezone'))
    =/  tmo=(unit @dr)  ?:(=(0 (jnum args 'timeout')) timeout.u.c `(mul (jnum args 'timeout') ~s1))
    =/  prx=(unit @t)
      =/  v  (~(get by args) 'proxy')
      ?.  ?=([~ %s *] v)  proxy.u.c
      ?:(=('' p.u.v) ~ `p.u.v)
    ::  a new device profile invalidates the live page
    =/  reset  (drop-seed u.c)
    =.  contexts  (~(put by contexts) cid ?:(=(dev device.u.c) u.c(device dev, timeout tmo, proxy prx) reset(device dev, timeout tmo, proxy prx)))
    [(ok (rap 3 'configured ' cid ': ' (en:json:html (device-json dev)) ~)) state]
  [(bad (cat 3 'unknown action: ' act)) state]
++  tool-files
  |=  [eyre-id=@ta id=json cid=context-id args=(map @t json)]
  ^-  (quip card _state)
  =/  act  =/(a (~(get by args) 'action') ?:(?=([~ %s *] a) p.u.a 'list'))
  =/  name  (jstr args 'name')
  =/  ok  |=(t=@t ^-((list card) (respond-json eyre-id 200 (text-result:mcp id t |))))
  =/  bad  |=(t=@t ^-((list card) (respond-json eyre-id 200 (text-result:mcp id t &))))
  =/  c  (~(get by contexts) cid)
  ?~  c  [(bad 'no such context') state]
  ?:  =('list' act)
    ?:  =(~ files.u.c)  [(ok 'no files in this context') state]
    :_  state
    %-  ok
    %+  rap  3
    %+  join  '\0a'
    %+  turn  ~(tap by files.u.c)
    |=  [n=@t f=file]
    (rap 3 n '  ' mime.f '  ' (scot %ud size.f) ' bytes  ' (scot %da when.f) '  /browser/files/' cid '/' n '  from ' url.f ~)
  =/  f  (~(get by files.u.c) name)
  ?~  f  [(bad 'no such file; browser_files action=list shows them') state]
  ?:  =('delete' act)
    =.  contexts  (~(put by contexts) cid u.c(files (~(del by files.u.c) name), file-bytes (sub file-bytes.u.c (min file-bytes.u.c size.u.f))))
    [(ok (rap 3 'deleted ' name ~)) state]
  ?:  =('read' act)
    =/  textual  (textual-mime mime.u.f)
    ?.  textual  [(ok (rap 3 name ' is ' mime.u.f ' (' (scot %ud size.u.f) ' bytes); fetch it from /browser/files/' cid '/' name ' with the API key' ~)) state]
    =/  r  (page-text:mcp q.data.u.f (max 1 (jnum args 'page')) page-bytes.policy)
    [(ok (rap 3 name ' (' mime.u.f ') page ' (scot %ud page.r) '/' (scot %ud pages.r) '\0a---\0a' body.r ~)) state]
  [(bad (cat 3 'unknown action: ' act)) state]
++  textual-mime
  |=  mime=@t
  ^-  ?
  =/  t  (trip mime)
  ?|  =("text/" (scag 5 t))
      ?=(^ (find "json" t))
      ?=(^ (find "xml" t))
      ?=(^ (find "javascript" t))
      ?=(^ (find "csv" t))
      ?=(^ (find "yaml" t))
      ?=(^ (find "markdown" t))
  ==
++  tool-log
  |=  [eyre-id=@ta id=json cid=context-id args=(map @t json)]
  ^-  (quip card _state)
  =/  c  (~(get by contexts) cid)
  ?~  c  :_(state (respond-json eyre-id 200 (text-result:mcp id 'no such context' &)))
  =/  lines
    %+  turn  record.u.c
    |=  e=event
    (rap 3 (scot %da when.e) '  ' kind.e '  ' detail.e ~)
  =/  r  (paginate:mcp lines (max 1 (jnum args 'page')) page-bytes.policy)
  :_  state
  (respond-json eyre-id 200 (text-result:mcp id (rap 3 (scot %ud total.r) ' events, page ' (scot %ud page.r) '/' (scot %ud pages.r) '\0a' body.r ~) |))
::  +begin-fetch: policy-check a URL and request it with Iris
::
++  begin-fetch
  |=  [jid=@ud target=@t method=@t body=(unit octs) ctype=@t referrer=@t push=? extra=header-list:http]
  ^-  (quip card _state)
  =/  =job  (~(got by jobs) jid)
  =/  parts  (split:url target)
  ?~  parts  (finish-error jid (cat 3 'not an absolute http(s) URL: ' target))
  =/  why  (refused u.parts)
  ?^  why  (finish-error jid (rap 3 'refused ' target ': ' u.why ~))
  ?:  (gth hops.job max-redirects.policy)  (finish-error jid 'too many redirects')
  =/  c  (~(got by contexts) cid.job)
  =/  =request:http  (make-request u.parts method body ctype referrer c & extra)
  =.  jobs  (~(put by jobs) jid job(phase [%fetch (render:url u.parts) method body ctype referrer push now.bowl]))
  :_  state
  :~  [%pass /iris/job/(scot %ud jid)/(scot %ud hops.job) %arvo %i %request request [0 0]]
  ==
++  refused
  |=  p=parts:url
  ^-  (unit @t)
  ?:  (lien deny.policy |=(pat=@t (match-pattern:url pat host.p)))  `'host is denied by policy'
  ?:  &(!=(~ allow.policy) !(lien allow.policy |=(pat=@t (match-pattern:url pat host.p))))  `'host is not in the allow list'
  ?:  &(block-private.policy (private:url host.p))  `'private or loopback hosts are blocked by policy'
  ~
++  refused-sub
  |=  [p=parts:url kind=@t]
  ^-  (unit @t)
  =/  top  (refused p)
  ?^  top  top
  ?:  (lien block-hosts.policy |=(pat=@t (match-pattern:url pat host.p)))  `'host is on the block list'
  ?:  (lien block-kinds.policy |=(k=@t =(k kind)))  `(rap 3 'resource kind ' kind ' is blocked by policy' ~)
  ~
::  +make-request: headers, cookies and an optional gateway proxy
::
++  make-request
  |=  [p=parts:url method=@t body=(unit octs) ctype=@t referrer=@t c=context top=? extra=header-list:http]
  ^-  request:http
  =/  cookies  (header:ck (for-request:ck cookies.c p now.bowl &))
  =/  ua  ?.(=('' user-agent.device.c) user-agent.device.c ?:(mobile.device.c mobile-ua user-agent.policy))
  =/  lang  ?:(=('' locale.device.c) accept-language.policy (rap 3 locale.device.c ',' (end [3 2] locale.device.c) ';q=0.8' ~))
  =/  headers=header-list:http
    %+  murn
      :~  ['user-agent' ua]
          ['accept' ?:(top 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' '*/*')]
          ['accept-language' lang]
          ['accept-encoding' 'identity']
          ['cookie' cookies]
          ['referer' referrer]
          ['content-type' ?~(body '' ctype)]
      ==
    |=([k=@t v=@t] ?:(=('' v) ~ `[k v]))
  =/  verb=method:http  ?:(=('POST' method) %'POST' ?:(=('PUT' method) %'PUT' ?:(=('DELETE' method) %'DELETE' ?:(=('PATCH' method) %'PATCH' ?:(=('HEAD' method) %'HEAD' %'GET')))))
  =/  target  (render:url p)
  =/  final=@t
    ?~  proxy.c  target
    =/  tpl=tape  (trip u.proxy.c)
    =/  at  (find "\{url}" tpl)
    ?~  at  target
    (crip (weld (scag u.at tpl) (weld (en-urlt:html (trip target)) (slag (add u.at 5) tpl))))
  [verb final (weld headers extra) body]
::  +handle-response: an Iris response for a job
::
++  handle-response
  |=  [jid=@ud hop=@ud res=client-response:iris]
  ^-  (quip card _state)
  ?:  ?=(%progress -.res)  `state
  =/  mjob  (~(get by jobs) jid)
  ?~  mjob  `state
  =/  =job  u.mjob
  ?:  ?=(%cancel -.res)  (finish-error jid 'the runtime cancelled the request')
  =/  status  status-code.response-header.res
  =/  headers  headers.response-header.res
  =/  ctype=@t  (cass-cord (fall (get-header:http 'content-type' headers) ''))
  =/  raw=@t
    ?~  full-file.res  ''
    (end [3 max-body.policy] q.data.u.full-file.res)
  =/  body=@t  (transcode raw ctype)
  ?-    -.phase.job
      %queued  `state
      %fetch
    ?.  =(hop hops.job)  `state
    =/  parts  (need (split:url url.phase.job))
    =.  state  (absorb-cookies cid.job parts headers)
    =.  state  (note cid.job 'response' (rap 3 (scot %ud status) ' ' url.phase.job ' ' ctype ' ' (scot %ud (met 3 raw)) 'B ' (scot %ud (ms-since since.phase.job)) 'ms' ~))
    ::  redirects
    =/  location  (get-header:http 'location' headers)
    ?:  &(?=(^ location) ?=(?(%301 %302 %303 %307 %308) status))
      =/  next  (resolve:url parts u.location)
      ?~  next  (finish-error jid (cat 3 'bad redirect location: ' u.location))
      =/  keep  ?=(?(%307 %308) status)
      =.  jobs  (~(put by jobs) jid job(hops +(hops.job)))
      %-  begin-fetch
      :*  jid  (render:url u.next)
          ?:(keep method.phase.job 'GET')
          ?:(keep body.phase.job ~)
          ?:(keep ctype.phase.job '')
          url.phase.job
          push.phase.job
          ~
      ==
    ::  basic auth with a stored credential
    =/  challenge  (get-header:http 'www-authenticate' headers)
    ?:  ?&  =(401 status)  !auth-retried.job  ?=(^ challenge)
            =("basic" (scag 5 (cass (trip u.challenge))))
            (~(has by credentials) (origin:url parts))
        ==
      =/  cred  (~(got by credentials) (origin:url parts))
      =/  token  (en:base64:mimes:html (as-octs:mimes:html (rap 3 username.cred ':' password.cred ~)))
      =.  jobs  (~(put by jobs) jid job(auth-retried &))
      (begin-fetch jid url.phase.job method.phase.job body.phase.job ctype.phase.job referrer.phase.job push.phase.job ~[['authorization' (cat 3 'Basic ' token)]])
    =/  final-url  (render:url parts)
    =/  disposition  (cass-cord (fall (get-header:http 'content-disposition' headers) ''))
    =/  attachment  =("attachment" (scag 10 (trip disposition)))
    =/  html=?
      ?&  !attachment
          ?|  ?=(^ (find "html" (trip ctype)))
              &(=('' ctype) ?=(^ (find "<html" (cass (trip (end [3 512] body))))))
      ==  ==
    =/  textual=?  &(!attachment (textual-mime ctype))
    =/  c  (~(got by contexts) cid.job)
    ?.  html
      =.  c  (push-history c final-url push.phase.job)
      ?:  textual
        =/  =page  [final-url final-url status hops.job %text ~ body 0 now.bowl | ~ ~ '']
        =.  c  (drop-seed c(page `page, last now.bowl))
        =.  contexts  (~(put by contexts) cid.job c)
        =/  r  (page-text:mcp body 1 page-bytes.policy)
        (finish-text jid (rap 3 (page-header page) 'Text page 1/' (scot %ud pages.r) ?:((gth pages.r 1) ' (browser_text page=2 for more)' '') '\0a---\0a' body.r ~) |)
      ::  a download: keep the bytes in the context
      =/  name  (file-name disposition parts)
      =/  size  (met 3 raw)
      =/  mime  ?:(=('' ctype) 'application/octet-stream' ctype)
      =/  stored=?  (lte (add file-bytes.c size) max-files.policy)
      =?  files.c  stored  (~(put by files.c) name [mime size [size raw] now.bowl final-url])
      =?  file-bytes.c  stored  (add file-bytes.c size)
      =/  summary
        %+  rap  3
        :~  'Downloaded '  name  ' ('  mime  ', '  (scot %ud size)  ' bytes'
            ?:(=(size max-body.policy) ', truncated at max-body' '')  ')'
            ?:  stored
              (rap 3 '. Read it with browser_files action=read name=' name ', or GET /browser/files/' cid.job '/' name ~)
            '. Not kept: the context\'s file storage is full; delete files with browser_files.'
        ==
      =/  =page  [final-url name status hops.job %binary ~ summary 0 now.bowl | ~ ~ '']
      =.  c  (drop-seed c(page `page, last now.bowl))
      =.  contexts  (~(put by contexts) cid.job c)
      =.  state  (note cid.job 'download' (rap 3 name ' ' (scot %ud size) 'B' ~))
      (finish-text jid (rap 3 (page-header page) summary ~) |)
    ::  html: load into a runtime
    =.  c  (push-history c final-url push.phase.job)
    =/  page-parts  (need (split:url final-url))
    =/  opts  (load-options c page-parts job)
    =^  base  state  get-pristine
    =.  c  (drop-seed c)
    =.  c  c(page ~, seed `base, last now.bowl)
    =.  contexts  (~(put by contexts) cid.job c)
    =.  jobs  (~(put by jobs) jid job(phase [%run %load ~ push.phase.job], args (~(put by args.job) '__status' (numb:enjs:format status))))
    (run-script jid %load (load:js body final-url opts))
  ::
      %run
    ?~  sub.phase.job  `state
    =/  sub  u.sub.phase.job
    =/  parts  (need (split:url url.sub))
    =.  state  (absorb-cookies cid.job parts headers)
    =.  state  (note cid.job 'subrequest' (rap 3 kind.sub ' ' (scot %ud status) ' ' url.sub ' ' (scot %ud (met 3 raw)) 'B ' (scot %ud (ms-since since.sub)) 'ms' ~))
    =?  state  &(cache-scripts.policy =(200 status) |(=('script' kind.sub) =('stylesheet' kind.sub)))
      (cache-put url.sub ctype body)
    =.  jobs  (~(put by jobs) jid job(phase phase.job(sub ~)))
    (resume jid ~[octs+(tem:js (sub-json status headers body url.sub))])
  ==
++  sub-json
  |=  [status=@ud headers=header-list:http body=@t url=@t]
  ^-  @t
  =/  visible
    %+  murn  headers
    |=  [k=@t v=@t]
    =/  lk  (cass-cord k)
    ?:  =('set-cookie' lk)  ~
    `[lk `json`s+v]
  %-  en:json:html
  %-  pairs:enjs:format
  :~  ['status' (numb:enjs:format status)]
      ['headers' (pairs:enjs:format visible)]
      ['body' s+body]
      ['url' s+url]
  ==
++  file-name
  |=  [disposition=@t p=parts:url]
  ^-  @t
  =/  d  (trip disposition)
  =/  at  (find "filename=" d)
  =/  from-header=tape
    ?~  at  ""
    =/  rest  (slag (add u.at 9) d)
    =/  q  ?:(&(?=(^ rest) =('"' i.rest)) t.rest rest)
    =|  out=tape
    |-  ^-  tape
    ?~  q  (flop out)
    ?:  |(=('"' i.q) =(';' i.q))  (flop out)
    $(q t.q, out [i.q out])
  ?.  =(~ from-header)  (crip from-header)
  =/  segs=(list tape)  (skip (segments:url (trip path.p)) |=(s=tape =(~ s)))
  =/  last=tape  (fall (head-of (flop segs)) "")
  ?:  =(~ last)  'download'
  (crip last)
::  +transcode: latin-1 bodies become UTF-8
::
++  transcode
  |=  [body=@t ctype=@t]
  ^-  @t
  =/  t  (trip ctype)
  ?.  ?|  ?=(^ (find "iso-8859-1" t))
          ?=(^ (find "latin1" t))
          ?=(^ (find "windows-1252" t))
          ?=(^ (find "cp1252" t))
      ==
    body
  (rap 3 (turn (rip 3 body) |=(b=@ ^-(@t ?:((lth b 128) b (tuft b))))))
::  script cache
::
++  cache-put
  |=  [url=@t mime=@t body=@t]
  ^+  state
  =/  size  (met 3 body)
  ?:  (gth size (div max-cache.policy 4))  state
  =/  old  (~(get by cache) url)
  =?  cache-bytes  ?=(^ old)  (sub cache-bytes (min cache-bytes (met 3 body.u.old)))
  =.  cache  (~(put by cache) url [now.bowl mime body])
  =.  cache-bytes  (add cache-bytes size)
  |-  ^+  state
  ?:  (lte cache-bytes max-cache.policy)  state
  =/  oldest=(unit [u=@t c=cached])
    %+  roll  ~(tap by cache)
    |=  [[u=@t c=cached] acc=(unit [u=@t c=cached])]
    ?~  acc  `[u c]
    ?:  (lth when.c when.c.u.acc)  `[u c]
    acc
  ?~  oldest  state(cache ~, cache-bytes 0)
  $(cache (~(del by cache) u.u.oldest), cache-bytes (sub cache-bytes (min cache-bytes (met 3 body.c.u.oldest))))
++  cache-get
  |=  url=@t
  ^-  (unit cached)
  =/  c  (~(get by cache) url)
  ?~  c  ~
  ?:  (lth (add when.u.c cache-ttl.policy) now.bowl)  ~
  c
++  absorb-cookies
  |=  [cid=context-id parts=parts:url headers=header-list:http]
  ^+  state
  =/  c  (~(get by contexts) cid)
  ?~  c  state
  =/  sets  (skim headers |=([k=@t v=@t] =('set-cookie' (cass-cord k))))
  =.  cookies.u.c
    %+  roll  sets
    |=  [[k=@t v=@t] jar=_cookies.u.c]
    =/  got  (parse:ck v parts now.bowl)
    ?~  got  jar
    (store:ck jar u.got now.bowl)
  state(contexts (~(put by contexts) cid u.c))
++  push-history
  |=  [c=context target=@t push=?]
  ^-  context
  ?.  push  c
  ?:  =(`target (head-of back.c))  c
  c(back [target back.c], forward ~)
::  +load-options: the JSON the runtime needs to start a page
::
++  load-options
  |=  [c=context parts=parts:url =job]
  ^-  @t
  =/  visible  (for-request:ck cookies.c parts now.bowl |)
  =/  referrer  ?:(?=(%fetch -.phase.job) referrer.phase.job '')
  =/  dev  device.c
  %-  en:json:html
  %-  pairs:enjs:format
  :~  ['cookies' a+(turn visible |=(k=cookie (pairs:enjs:format ~[['name' s+name.k] ['value' s+value.k]])))]
      ['localStorage' o+(~(run by local-storage.c) |=(v=@t `json`s+v))]
      ['sessionStorage' o+(~(run by session-storage.c) |=(v=@t `json`s+v))]
      ['seed' (numb:enjs:format (end [0 31] (shax (jam [eny.bowl now.bowl]))))]
      ['now' (numb:enjs:format (unix-ms now.bowl))]
      ['referrer' s+referrer]
      :-  'device'
      %-  pairs:enjs:format
      :~  ['width' (numb:enjs:format width.dev)]
          ['height' (numb:enjs:format height.dev)]
          ['mobile' b+mobile.dev]
          ['userAgent' s+?.(=('' user-agent.dev) user-agent.dev ?:(mobile.dev mobile-ua user-agent.policy))]
          ['language' s+?:(=('' locale.dev) 'en-US' locale.dev)]
          ['timezone' s+timezone.dev]
      ==
      :-  'options'
      %-  pairs:enjs:format
      :~  ['js' b+js.job]
          ['css' b+css.policy]
          ['maxScriptBytes' (numb:enjs:format max-script-bytes.policy)]
          ['maxCssBytes' (numb:enjs:format max-css-bytes.policy)]
      ==
  ==
::  +get-pristine: a runtime with the bundle loaded and no page
::
++  get-pristine
  ^-  [seed:lia-sur:wasm _state]
  =/  have  pristine
  ?^  have  [u.have state]
  =/  out  (step:js &+(init:js now.bowl) fresh:js js-gap.policy)
  ?.  ?=(%0 -.yil.out)  [fresh:js state]
  =.  pristine  `seed.out
  [seed.out state]
::  +run-script / +run-action / +resume: drive the runtime for a job
::
++  run-script
  |=  [jid=@ud kind=?(%load %act %query) script=form:runnable:wasm]
  ^-  (quip card _state)
  =/  =job  (~(got by jobs) jid)
  =/  c  (~(got by contexts) cid.job)
  ?~  seed.c  (finish-error jid 'no live runtime')
  =/  push  ?:(?=(%run -.phase.job) push.phase.job ?:(?=(%fetch -.phase.job) push.phase.job &))
  =.  jobs  (~(put by jobs) jid job(phase [%run kind ~ push]))
  =/  out  (step:js &+script u.seed.c js-gap.policy)
  (advance jid out)
++  run-action
  |=  [jid=@ud action=json]
  ^-  (quip card _state)
  (run-script jid %act (act:js (en:json:html action)))
++  resume
  |=  [jid=@ud results=(list lia-value:lia-sur:wasm)]
  ^-  (quip card _state)
  =/  =job  (~(got by jobs) jid)
  =/  c  (~(got by contexts) cid.job)
  ?~  seed.c  (finish-error jid 'runtime was dropped while waiting')
  =/  out  (step:js |+results u.seed.c js-gap.policy)
  (advance jid out)
++  payload
  |=  [rs=(list lia-value:lia-sur:wasm) i=@ud]
  ^-  (unit @t)
  ?~  rs  ~
  ?.  =(0 i)  $(rs t.rs, i (dec i))
  ?.  ?=(%octs -.i.rs)  ~
  `q.i.rs
::  +advance: act on a runtime yield
::
++  advance
  |=  [jid=@ud out=outcome:js]
  ^-  (quip card _state)
  =/  =job  (~(got by jobs) jid)
  =/  c  (~(got by contexts) cid.job)
  =.  c  c(seed `seed.out)
  =.  contexts  (~(put by contexts) cid.job c)
  ?-    -.yil.out
      %2
    =.  contexts  (~(put by contexts) cid.job c(seed ~))   ::  a trapped run is already dropped by the jet
    =.  state  (note cid.job 'error' 'runtime crashed')
    (finish-error jid 'the JavaScript runtime crashed; retry with js=false')
  ::
      %1
    ?.  =(%fetch name.yil.out)
      =.  contexts  (~(put by contexts) cid.job (drop-seed c))
      (finish-error jid (cat 3 'unexpected runtime request: ' (scot %tas name.yil.out)))
    =/  args  args.yil.out
    ?.  ?=([[%octs *] [%octs *] [%octs *] [%octs *] *] args)
      (finish-error jid 'malformed fetch request from runtime')
    =/  target=@t  (fall (payload args 0) '')
    =/  method=@t  (fall (payload args 1) '')
    =/  hdr=@t  (fall (payload args 2) '')
    =/  bod=@t  (fall (payload args 3) '')
    =/  kind=@t  (fall (payload args 4) 'fetch')
    =/  refuse
      |=  why=@t
      ^-  (quip card _state)
      =.  jobs  (~(put by jobs) jid job(subrequests +(subrequests.job)))
      ?:  (gth subrequests.job (mul 4 max-subrequests.policy))
        =.  contexts  (~(put by contexts) cid.job (drop-seed c))
        (finish-error jid 'the page kept requesting blocked resources')
      (resume jid ~[octs+(tem:js (en:json:html (pairs:enjs:format ~[['error' s+why]])))])
    =/  parts  (split:url target)
    ?~  parts  (refuse 'only absolute http(s) URLs can be fetched')
    =/  why  (refused-sub u.parts kind)
    ?^  why  (refuse u.why)
    ?:  (gte subrequests.job max-subrequests.policy)  (refuse 'subrequest budget exhausted')
    ::  cached scripts and stylesheets answer immediately
    =/  hit  ?.(&(cache-scripts.policy =('get' (cass-cord method)) |(=('script' kind) =('stylesheet' kind))) ~ (cache-get target))
    ?^  hit
      =.  jobs  (~(put by jobs) jid job(subrequests +(subrequests.job)))
      =.  state  (note cid.job 'cached' (rap 3 kind ' ' target ~))
      (resume jid ~[octs+(tem:js (sub-json 200 ~[['content-type' mime.u.hit]] body.u.hit target))])
    =/  hdrs=(map @t json)
      =/  j  (de:json:html hdr)
      ?:(?=([~ %o *] j) p.u.j ~)
    =/  extra=header-list:http
      %+  murn  ~(tap by hdrs)
      |=  [k=@t v=json]
      =/  lk  (cass-cord k)
      ?:  ?=(?(%'cookie' %'host' %'content-length' %'accept-encoding' %'user-agent' %'referer') lk)  ~
      ?.  ?=([%s *] v)  ~
      `[lk p.v]
    =/  referer=@t
      =/  r  (~(get by hdrs) 'referer')
      ?:(?=([~ %s *] r) p.u.r ?~(page.c '' url.u.page.c))
    =/  body=(unit octs)  ?:(=('' bod) ~ `(tem:js bod))
    =/  =request:http  (make-request u.parts method body '' referer c | extra)
    =/  ph  phase.job
    ?>  ?=(%run -.ph)
    =.  jobs  (~(put by jobs) jid job(phase ph(sub `[target kind now.bowl]), subrequests +(subrequests.job)))
    :_  state
    :~  [%pass /iris/job/(scot %ud jid)/(scot %ud hops.job) %arvo %i %request request [0 0]]
    ==
  ::
      %0
    =/  ph  phase.job
    ?.  ?=(%run -.ph)  (finish-error jid 'runtime result in the wrong phase')
    =/  rs  p.yil.out
    =/  ok=@  ?~(rs 0 ?:(?=(%i32 -.i.rs) +.i.rs 0))
    ?:  =(0 ok)
      =/  msg  (fall (payload rs 1) 'runtime error')
      =.  contexts  (~(put by contexts) cid.job (drop-seed c))
      =.  state  (note cid.job 'error' msg)
      (finish-error jid msg)
    =/  first  (payload rs 1)
    =/  second  (payload rs 2)
    ?-    kind.ph
        %load
      ?~  first  (finish-error jid 'malformed load result')
      (finish-load jid u.first)
    ::
        %act
      ?:  |(?=(~ first) ?=(~ second))  (finish-error jid 'malformed action result')
      (finish-act jid u.first u.second)
    ::
        %query
      ?~  first  (finish-error jid 'malformed query result')
      (finish-query jid u.first)
    ==
  ==
::  +absorb-result: cookies, storage and diagnostics reported by the runtime
::
++  absorb-result
  |=  [cid=context-id m=(map @t json)]
  ^+  state
  =/  c  (~(got by contexts) cid)
  =/  page-url  (jstr m 'url')
  =/  parts  (split:url page-url)
  =?  cookies.c  ?=(^ parts)
    %+  roll  (jlines m 'cookies')
    |=  [raw=@t jar=_cookies.c]
    =/  got  (parse:ck raw u.parts now.bowl)
    ?~  got  jar
    (store:ck jar u.got now.bowl)
  =?  local-storage.c  ?=(^ (jmap m 'localStorage'))  (need (jmap m 'localStorage'))
  =?  session-storage.c  ?=(^ (jmap m 'sessionStorage'))  (need (jmap m 'sessionStorage'))
  state(contexts (~(put by contexts) cid c))
++  diagnostics
  |=  m=(map @t json)
  ^-  [console=(list @t) dialogs=(list @t)]
  =/  console
    =/  v  (~(get by m) 'console')
    ?.  ?=([~ %a *] v)  ~
    %+  murn  p.u.v
    |=  j=json
    ?.  ?=([%o *] j)  ~
    `(rap 3 (jstr p.j 'level') ': ' (jstr p.j 'text') ~)
  =/  dialogs
    =/  v  (~(get by m) 'dialogs')
    ?.  ?=([~ %a *] v)  ~
    %+  murn  p.u.v
    |=  j=json
    ?.  ?=([%o *] j)  ~
    `(rap 3 (jstr p.j 'type') ': ' (jstr p.j 'message') (jstr p.j 'url') ~)
  [console dialogs]
::  +finish-load: the runtime finished loading a page
::
++  finish-load
  |=  [jid=@ud res=@t]
  ^-  (quip card _state)
  =/  =job  (~(got by jobs) jid)
  =/  jon  (de:json:html res)
  ?.  ?=([~ %o *] jon)  (finish-error jid 'unreadable load result')
  =/  m  p.u.jon
  ?.  =([~ %b &] (~(get by m) 'ok'))  (finish-error jid (cat 3 'load failed: ' (jstr m 'error')))
  =.  state  (absorb-result cid.job m)
  =/  c  (~(got by contexts) cid.job)
  =/  ph  phase.job
  ?>  ?=(%run -.ph)
  =/  nav  (~(get by m) 'navigate')
  ?:  &(?=([~ %o *] nav) (lth hops.job max-redirects.policy))
    =/  n  p.u.nav
    =/  next  (jstr n 'url')
    ?.  =('' next)
      =.  jobs  (~(put by jobs) jid job(hops +(hops.job)))
      =.  state  (note cid.job 'redirect' (rap 3 (jstr n 'reason') ' ' next ~))
      %-  begin-fetch
      :*  jid  next  (jstr n 'method')
          ?:(=('' (jstr n 'body')) ~ `(tem:js (jstr n 'body')))
          (jstr n 'contentType')  (jstr m 'url')  push.ph  ~
      ==
    (store-and-reply jid c m)
  (store-and-reply jid c m)
++  store-and-reply
  |=  [jid=@ud c=context m=(map @t json)]
  ^-  (quip card _state)
  =/  =job  (~(got by jobs) jid)
  =/  [console=(list @t) dialogs=(list @t)]  (diagnostics m)
  =/  status  (jnum args.job '__status')
  =/  stats  (jobj m 'stats')
  =/  =page
    :*  (jstr m 'url')  (jstr m 'title')  status  hops.job  %html
        (jlines m 'lines')  ''  (jnum m 'interactive')  now.bowl  js.job  console  dialogs  (jstr m 'description')
    ==
  =.  c  c(page `page, last now.bowl)
  =?  back.c  &(?=(^ back.c) !=(i.back.c url.page))  [url.page (slag 1 `(list @t)`back.c)]
  =.  contexts  (~(put by contexts) cid.job c)
  =.  state  (note cid.job 'loaded' (rap 3 (jstr m 'title') ' | ' (scot %ud (jnum m 'interactive')) ' interactive, ' (scot %ud (jnum stats 'scripts')) ' scripts, ' (scot %ud (jnum stats 'errors')) ' errors, ' (scot %ud (jnum stats 'subrequests')) ' subrequests, ' (scot %ud (ms-since started.job)) 'ms' ~))
  (finish-text jid (render-page c page 1 ~) |)
::  +finish-act: an action ran; maybe it navigated
::
++  finish-act
  |=  [jid=@ud act-res=@t res=@t]
  ^-  (quip card _state)
  =/  =job  (~(got by jobs) jid)
  =/  ajon  (de:json:html act-res)
  ?.  ?=([~ %o *] ajon)  (finish-error jid 'unreadable action result')
  =/  am  p.u.ajon
  ?.  =([~ %b &] (~(get by am) 'ok'))
    =.  state  (note cid.job 'error' (rap 3 tool.job ': ' (jstr am 'error') ~))
    (finish-error jid (jstr am 'error'))
  =/  jon  (de:json:html res)
  ?.  ?=([~ %o *] jon)  (finish-error jid 'unreadable page result')
  =/  m  p.u.jon
  =.  state  (absorb-result cid.job m)
  =/  c  (~(got by contexts) cid.job)
  =.  state  (note cid.job 'action' (rap 3 tool.job ' ' (jstr am 'acted') ~))
  ?:  =('browser_eval' tool.job)
    =/  v  (~(get by am) 'value')
    (finish-text jid (en:json:html (fall v ~)) |)
  =/  nav  (~(get by am) 'navigate')
  ?:  ?=([~ %o *] nav)
    =/  n  p.u.nav
    =/  next  (jstr n 'url')
    ?:  ?=([~ %n *] (~(get by n) 'history'))
      (finish-error jid 'the page requested history navigation; use browser_back')
    ?:  =('' next)  (finish-error jid 'the page requested an unsupported navigation')
    =.  jobs  (~(put by jobs) jid job(hops 0))
    %-  begin-fetch
    :*  jid  next  (jstr n 'method')
        ?:(=('' (jstr n 'body')) ~ `(tem:js (jstr n 'body')))
        (jstr n 'contentType')  (jstr m 'url')  &  ~
    ==
  =/  [console=(list @t) dialogs=(list @t)]  (diagnostics m)
  =/  old  (fall page.c *page)
  =/  =page  old(url (jstr m 'url'), title (jstr m 'title'), lines (jlines m 'lines'), interactive (jnum m 'interactive'), console console, dialogs dialogs)
  =.  contexts  (~(put by contexts) cid.job c(page `page, last now.bowl))
  =/  summary
    ?:  =('browser_wait' tool.job)
      =/  f  (~(get by am) 'found')
      (rap 3 'Waited; ' ?:(?=([~ %b *] f) ?:(p.u.f 'condition met.' 'condition not met within the time given.') 'timers ran.') ~)
    (rap 3 'Action ' tool.job ' on ' (jstr am 'acted') ' done.' ~)
  (finish-text jid (render-page c page 1 ~[summary]) |)
::  +finish-query: snapshot/text/find/links/html/metadata
::
++  finish-query
  |=  [jid=@ud res=@t]
  ^-  (quip card _state)
  =/  =job  (~(got by jobs) jid)
  =/  jon  (de:json:html res)
  ?.  ?=([~ %o *] jon)  (finish-error jid 'unreadable query result')
  =/  m  p.u.jon
  ?:  ?=(^ (~(get by m) 'error'))  (finish-error jid (jstr m 'error'))
  =/  c  (~(got by contexts) cid.job)
  =/  pg  (max 1 (jnum args.job 'page'))
  ?+    tool.job  (finish-text jid res |)
      %'browser_snapshot'
    =/  lines  (jlines m 'lines')
    =/  old  (fall page.c *page)
    =/  =page  old(lines lines, interactive (jnum m 'interactive'))
    =.  contexts  (~(put by contexts) cid.job c(page `page))
    (finish-text jid (render-page c page pg ~) |)
  ::
      %'browser_text'
    =/  r  (page-text:mcp (jstr m 'text') pg page-bytes.policy)
    =/  old  (fall page.c *page)
    (finish-text jid (rap 3 (page-header old) 'Text page ' (scot %ud page.r) '/' (scot %ud pages.r) ?:((lth page.r pages.r) (rap 3 ' (call browser_text with page=' (scot %ud +(page.r)) ' for more)' ~) '') '\0a---\0a' body.r ~) |)
  ::
      %'browser_html'
    =/  r  (page-text:mcp (jstr m 'html') pg page-bytes.policy)
    (finish-text jid (rap 3 'HTML page ' (scot %ud page.r) '/' (scot %ud pages.r) '\0a---\0a' body.r ~) |)
  ::
      %'browser_metadata'
    =?  contexts  ?=(^ page.c)
      (~(put by contexts) cid.job c(page `u.page.c(description (jstr m 'description'))))
    (finish-text jid res |)
  ::
      %'browser_find'
    =/  v  (~(get by m) 'matches')
    =/  lines
      ?.  ?=([~ %a *] v)  ~
      %+  murn  p.u.v
      |=  j=json
      ?.  ?=([%o *] j)  ~
      `(rap 3 (scot %ud (jnum p.j 'line')) ': ' (jstr p.j 'text') ~)
    (finish-text jid (rap 3 (scot %ud (jnum m 'total')) ' matching lines\0a' (rap 3 (join '\0a' lines)) ~) |)
  ::
      %'browser_links'
    =/  v  (~(get by m) 'links')
    =/  lines
      ?.  ?=([~ %a *] v)  ~
      %+  murn  p.u.v
      |=  j=json
      ?.  ?=([%o *] j)  ~
      `(rap 3 (jstr p.j 'ref') ' "' (jstr p.j 'text') '" -> ' (jstr p.j 'href') ~)
    =/  r  (paginate:mcp lines pg page-bytes.policy)
    (finish-text jid (rap 3 (scot %ud total.r) ' links, page ' (scot %ud page.r) '/' (scot %ud pages.r) '\0a' body.r ~) |)
  ==
::  rendering
::
++  page-header
  |=  p=page
  ^-  @t
  %+  rap  3
  :~  'Page: '  title.p  '\0a'
      'URL: '  url.p  ' (HTTP '  (scot %ud status.p)
      ?:(=(0 hops.p) '' (rap 3 ', ' (scot %ud hops.p) ' redirects' ~))
      ?:(js.p '' ', scripts off')
      ')\0a'
      ?:(=('' description.p) '' (rap 3 'Description: ' (clip description.p) '\0a' ~))
  ==
++  render-page
  |=  [c=context p=page pg=@ud extra=(list @t)]
  ^-  @t
  =/  r  (paginate:mcp lines.p pg page-bytes.policy)
  =/  more=@t
    ?.  (lth page.r pages.r)  ''
    (rap 3 ' Call browser_snapshot with page=' (scot %ud +(page.r)) ' for more.' ~)
  =/  console=@t
    ?:  =(~ console.p)  ''
    (rap 3 'Console: ' (rap 3 (join ' | ' (turn (scag 3 console.p) clip))) '\0a' ~)
  =/  dialogs=@t
    ?:  =(~ dialogs.p)  ''
    (rap 3 'Dialogs: ' (rap 3 (join ' | ' (turn (scag 3 dialogs.p) clip))) '\0a' ~)
  %+  rap  3
  :~  (page-header p)
      ?~(extra '' (rap 3 (rap 3 (join '\0a' extra)) '\0a' ~))
      'Snapshot page '  (scot %ud page.r)  '/'  (scot %ud pages.r)
      ': lines '  (scot %ud first.r)  '-'  (scot %ud last.r)  ' of '  (scot %ud total.r)
      ', '  (scot %ud interactive.p)  ' interactive elements.'  more  '\0a'
      console  dialogs
      '---\0a'  body.r
  ==
::  +finish-text / +finish-error: answer the client and start the next job
::
++  finish-text
  |=  [jid=@ud text=@t is-error=?]
  ^-  (quip card _state)
  =/  mjob  (~(get by jobs) jid)
  ?~  mjob  `state
  =/  =job  u.mjob
  =.  jobs  (~(del by jobs) jid)
  =/  cards  (respond-json eyre-id.job 200 (text-result:mcp rpc-id.job text is-error))
  ?.  =(`jid (~(get by active) cid.job))  [cards state]
  =.  active  (~(del by active) cid.job)
  =/  waiting  (fall (~(get by queue) cid.job) ~)
  ?~  waiting  [cards state]
  =.  queue  (~(put by queue) cid.job t.waiting)
  =^  more  state  (start-job i.waiting)
  [(weld cards more) state]
++  finish-error
  |=  [jid=@ud msg=@t]
  ^-  (quip card _state)
  (finish-text jid (cat 3 'Error: ' msg) &)
::  +handle-timeout: the wall-clock budget for a job expired
::
++  handle-timeout
  |=  jid=@ud
  ^-  (quip card _state)
  =/  mjob  (~(get by jobs) jid)
  ?~  mjob  `state
  =/  =job  u.mjob
  =/  cancel=(list card)
    ?.  |(?=(%fetch -.phase.job) &(?=(%run -.phase.job) ?=(^ sub.phase.job)))  ~
    ~[[%pass /iris/job/(scot %ud jid)/(scot %ud hops.job) %arvo %i %cancel-request ~]]
  =?  contexts  ?=(%run -.phase.job)
    =/  c  (~(get by contexts) cid.job)
    ?~  c  contexts
    (~(put by contexts) cid.job (drop-seed u.c))
  =?  queue  ?=(%queued -.phase.job)
    (~(put by queue) cid.job (skip (fall (~(get by queue) cid.job) ~) |=(j=@ud =(j jid))))
  =.  state  (note cid.job 'timeout' tool.job)
  =/  ctx  (fall (~(get by contexts) cid.job) (fresh-context now.bowl))
  =^  cards  state
    (finish-error jid (rap 3 'timed out after ' (scot %ud (div (fall timeout.ctx timeout.policy) ~s1)) 's; a script-heavy page may need js=false' ~))
  [(weld cancel cards) state]
--
