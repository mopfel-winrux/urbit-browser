::  browser: a headless browser as a Gall agent
::
::    Pages are fetched with Iris, parsed and scripted by a JavaScript
::    runtime running under QuickJS on urwasm, and exposed to model
::    clients through a self-served MCP endpoint at /browser/mcp.
::
/-  wasm-lia
|%
+$  context-id  @t
::  a cookie in a context's jar
::
+$  cookie
  $:  name=@t
      value=@t
      domain=@t            ::  lowercase host, no leading dot
      path=@t              ::  begins with /
      secure=?
      http-only=?
      host-only=?          ::  no Domain attribute: exact host match
      expires=(unit @da)   ::  ~ for session cookies
  ==
::  operator policy for the whole agent
::
+$  policy
  $:  allow=(list @t)      ::  host patterns; empty allows every host
      deny=(list @t)       ::  host patterns refused before allow
      block-private=?      ::  refuse loopback, RFC 1918, link-local, .local
      block-hosts=(list @t)   ::  subresource hosts never fetched (ads, trackers)
      block-kinds=(list @t)   ::  subresource kinds never fetched (script, stylesheet, xhr, fetch, beacon)
      max-body=@ud         ::  bytes of a response body kept
      max-redirects=@ud
      js=?                 ::  run page scripts by default
      css=?                ::  apply stylesheets for visibility
      js-gap=@dr           ::  %jinx CPU budget per engine step (0: none)
      max-script-bytes=@ud ::  external script bytes fetched per page
      max-css-bytes=@ud    ::  stylesheet bytes fetched per page
      max-subrequests=@ud  ::  fetch/XHR/script requests per tool call
      cache-scripts=?      ::  reuse fetched scripts and stylesheets across pages
      cache-ttl=@dr
      max-cache=@ud        ::  bytes of cached scripts and stylesheets
      max-files=@ud        ::  bytes of downloads kept per context
      max-record=@ud       ::  events kept per context
      page-bytes=@ud       ::  snapshot bytes per result page
      max-contexts=@ud
      max-live=@ud         ::  contexts keeping a live JS runtime
      idle-expiry=@dr      ::  contexts untouched this long are dropped
      timeout=@dr          ::  wall clock per tool call
      user-agent=@t
      accept-language=@t
  ==
::  what a page pretends to be
::
+$  device
  $:  width=@ud
      height=@ud
      mobile=?
      user-agent=@t        ::  '' uses the policy default
      locale=@t            ::  '' uses the policy default
      timezone=@t
  ==
::  one entry of a context's recording
::
+$  event  [when=@da kind=@t detail=@t]
::  a downloaded file
::
+$  file  [mime=@t size=@ud data=octs when=@da url=@t]
::  a stored login for an origin; never exposed to model clients
::
+$  credential  [origin=@t username=@t password=@t]
::  what the runtime knows about the current page
::
+$  page
  $:  url=@t
      title=@t
      status=@ud
      hops=@ud             ::  redirects followed
      kind=?(%html %text %binary)
      lines=(list @t)      ::  latest snapshot outline
      text=@t              ::  readable text for non-html pages
      interactive=@ud
      loaded=@da
      js=?                 ::  scripts ran
      console=(list @t)
      dialogs=(list @t)
      description=@t
  ==
::  a browsing context: cookie jar, history, storage and a page
::
+$  context
  $:  cookies=(list cookie)
      back=(list @t)       ::  previous urls, most recent first
      forward=(list @t)
      local-storage=(map @t @t)
      session-storage=(map @t @t)
      page=(unit page)
      seed=(unit seed:lia-sur:wasm-lia)   ::  live QuickJS instance
      created=@da
      last=@da
      =device
      proxy=(unit @t)      ::  gateway template with {url}
      timeout=(unit @dr)
      record=(list event)  ::  most recent first
      files=(map @t file)
      file-bytes=@ud
      events=@ud
  ==
::  pokes
::
+$  action
  $%  [%set-policy =policy]
      [%rotate-key ~]
      [%close-context id=context-id]
      [%close-all ~]
      [%clear-cookies id=context-id]
      [%set-cookie id=context-id =cookie]
      [%drop-runtime id=context-id]     ::  free the live JS instance
      [%set-credential =credential]
      [%del-credential origin=@t]
      [%set-proxy id=context-id proxy=(unit @t)]
      [%set-device id=context-id =device]
      [%import-context id=context-id state=json]
      [%clear-cache ~]
  ==
--
