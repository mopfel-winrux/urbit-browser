::  browser-mcp: tool catalog, JSON-RPC envelopes and result paging
::
/-  *browser
|%
++  protocol-version  '2025-06-18'
++  server-version  '0.2.0'
++  ctx-field  ['context' 'string' 'Context name (default "default"). Contexts isolate cookies, history, storage and files.' |]
++  page-field  ['page' 'integer' 'Result page number, starting at 1.' |]
::  +tools: the catalog served by tools/list
::
++  tools
  ^-  json
  :-  %a
  :~  %^  tool  'browser_navigate'
        '''
        Open a URL in a browsing context and return the page as a text outline (an accessibility-style snapshot). Interactive elements carry refs like e12 that browser_click, browser_type and browser_select accept. Long pages are split into numbered result pages; call browser_snapshot with page=2 to continue. Cookies, history, storage and downloads persist per context; give each independent task its own context name.
        '''
      %-  props
      :~  ['url' 'string' 'Absolute http(s) URL.' &]
          ctx-field
          ['js' 'boolean' 'Run the page\'s JavaScript (default from policy). Set false for a faster static read.' |]
          ['referrer' 'string' 'Optional Referer header.' |]
      ==
      %^  tool  'browser_snapshot'
        'Return the current page outline for a context, one result page at a time. Refs stay valid until the next navigation or snapshot.'
      %-  props
      :~  ctx-field  page-field
          ['selector' 'string' 'CSS selector: snapshot only the first matching element.' |]
      ==
      %^  tool  'browser_click'
        'Click an element by ref (from the latest snapshot) or CSS selector. Follows links and submits forms; returns the resulting page outline.'
      %-  props
      :~  ['ref' 'string' 'Element ref such as e7, or a CSS selector.' &]  ctx-field
      ==
      %^  tool  'browser_type'
        'Type text into a textbox, textarea or editable element (replacing its value unless clear=false). With submit=true, press Enter afterwards to submit the surrounding form.'
      %-  props
      :~  ['ref' 'string' 'Element ref such as e7, or a CSS selector.' &]
          ['text' 'string' 'Text to type.' &]
          ['submit' 'boolean' 'Press Enter after typing.' |]
          ['clear' 'boolean' 'Clear the field first (default true).' |]
          ctx-field
      ==
      %^  tool  'browser_select'
        'Choose an option in a <select> by value, visible label or index.'
      %-  props
      :~  ['ref' 'string' 'Element ref such as e7, or a CSS selector.' &]
          ['value' 'string' 'Option value, label or zero-based index.' &]
          ctx-field
      ==
      %^  tool  'browser_press'
        'Press a key (Enter, Escape, Tab, ArrowDown, a single character...) on an element or the focused element. Tab moves focus.'
      %-  props
      :~  ['key' 'string' 'Key name.' &]
          ['ref' 'string' 'Element ref or CSS selector; defaults to the focused element.' |]
          ['shift' 'boolean' 'Hold Shift (Shift+Tab moves focus backwards).' |]
          ctx-field
      ==
      %^  tool  'browser_hover'
        'Move the pointer over an element (fires mouseover/mouseenter), for menus that open on hover.'
      %-  props
      :~  ['ref' 'string' 'Element ref or CSS selector.' &]  ctx-field
      ==
      %^  tool  'browser_submit'
        'Submit a form: the form containing ref, or the first form on the page.'
      %-  props
      :~  ['ref' 'string' 'Element ref or CSS selector inside the form.' |]  ctx-field
      ==
      %^  tool  'browser_login'
        'Sign in on the current page using a credential the ship operator stored for this site (browser_login never receives passwords). Finds the password field and the username field near it, fills both and submits.'
      %-  props
      :~  ctx-field
          ['origin' 'string' 'Which stored credential to use, as an origin like https://example.com. Defaults to the current page\'s origin.' |]
          ['ref' 'string' 'The password field to use, when the page has several.' |]
      ==
      %^  tool  'browser_upload'
        'Attach a file to a file input, then submit the form with browser_submit or browser_click. The file content is given inline (text).'
      %-  props
      :~  ['ref' 'string' 'The file input\'s ref or CSS selector.' &]
          ['name' 'string' 'File name, for example report.csv.' &]
          ['content' 'string' 'File content.' &]
          ['type' 'string' 'MIME type (default text/plain).' |]
          ctx-field
      ==
      %^  tool  'browser_text'
        'Return the readable text of the current page (or of one element) as markdown-like text, paged. Better than the snapshot for reading articles.'
      %-  props
      :~  ctx-field  page-field
          ['ref' 'string' 'Element ref or CSS selector to read instead of the whole page.' |]
      ==
      %^  tool  'browser_metadata'
        'Return page metadata as JSON: title, description, language, canonical URL, Open Graph and Twitter tags, JSON-LD, author, dates, word count, headings, link/form counts and feeds.'
      %-  props
      :~  ctx-field
      ==
      %^  tool  'browser_find'
        'Search the current snapshot for text (case-insensitive) and return matching lines with their refs.'
      %-  props
      :~  ['query' 'string' 'Text to look for.' &]  ctx-field
      ==
      %^  tool  'browser_links'
        'List the links on the current page with refs and resolved URLs, optionally filtered by substring.'
      %-  props
      :~  ctx-field
          ['filter' 'string' 'Only links whose text or URL contains this.' |]
          page-field
      ==
      %^  tool  'browser_html'
        'Return the HTML of the page or of one element, paged. clean=true strips scripts, styles, hidden elements and presentation attributes for a much smaller document.'
      %-  props
      :~  ctx-field
          ['ref' 'string' 'Element ref or CSS selector.' |]
          ['clean' 'boolean' 'Return cleaned HTML (default false).' |]
          page-field
      ==
      %^  tool  'browser_eval'
        'Evaluate a JavaScript expression in the page and return its value as JSON. Needs JavaScript enabled in the policy.'
      %-  props
      :~  ['code' 'string' 'JavaScript source.' &]  ctx-field
      ==
      %^  tool  'browser_wait'
        'Let the page\'s timers run for up to ms milliseconds of virtual time, optionally until a selector matches a visible element or some text appears, then return a fresh snapshot.'
      %-  props
      :~  ['ms' 'integer' 'Milliseconds of virtual time, at most 30000 (default 3000).' |]
          ['selector' 'string' 'Stop as soon as this CSS selector matches a visible element.' |]
          ['text' 'string' 'Stop as soon as this text appears on the page.' |]
          ctx-field
      ==
      %^  tool  'browser_back'
        'Go back (or forward with direction="forward") in the context\'s history by reloading that URL.'
      %-  props
      :~  ['direction' 'string' '"back" (default) or "forward".' |]  ctx-field
      ==
      %^  tool  'browser_files'
        'Downloads collected by a context (binary responses and attachments). list them, read one (text files are returned paged; others give a URL), or delete one.'
      %-  props
      :~  ['action' 'string' '"list" (default), "read" or "delete".' |]
          ['name' 'string' 'File name for read/delete.' |]
          page-field
          ctx-field
      ==
      %^  tool  'browser_log'
        'The recording of a context: navigations with status and timing, actions, subrequests, downloads and errors, newest first, paged.'
      %-  props
      :~  ctx-field  page-field
      ==
      %^  tool  'browser_contexts'
        'Manage browsing contexts: list them; close one; clear-cookies; export a context\'s state (cookies, storage, history, device) as JSON; import such JSON into a context; configure its device (width, height, mobile, user_agent, locale, timezone), timeout in seconds and gateway proxy template.'
      %-  props
      :~  ['action' 'string' '"list" (default), "close", "clear-cookies", "export", "import" or "configure".' |]
          ['context' 'string' 'Context name for everything except list.' |]
          ['state' 'string' 'For import: the JSON produced by export.' |]
          ['width' 'integer' 'Viewport width in CSS pixels (configure).' |]
          ['height' 'integer' 'Viewport height in CSS pixels (configure).' |]
          ['mobile' 'boolean' 'Emulate a touch device with a mobile user agent (configure).' |]
          ['user_agent' 'string' 'Custom User-Agent (configure).' |]
          ['locale' 'string' 'Language tag such as fr-FR (configure).' |]
          ['timezone' 'string' 'IANA time zone name (configure).' |]
          ['timeout' 'integer' 'Seconds allowed per tool call in this context (configure).' |]
          ['proxy' 'string' 'Gateway template containing {url}, for example http://gw.local:8080/fetch?u={url}; empty clears it (configure).' |]
      ==
  ==
::  +names: every tool name in the catalog
::
++  names
  ^-  (set @t)
  =/  list  tools
  ?.  ?=([%a *] list)  ~
  %-  silt
  %+  murn  p.list
  |=  j=json
  ^-  (unit @t)
  ?.  ?=([%o *] j)  ~
  =/  n  (~(get by p.j) 'name')
  ?:(?=([~ %s *] n) `p.u.n ~)
++  tool
  |=  [name=@t desc=@t schema=json]
  ^-  json
  (pairs:enjs:format ~[['name' s+name] ['description' s+desc] ['inputSchema' schema]])
++  props
  |=  fields=(list [name=@t type=@t desc=@t required=?])
  ^-  json
  %-  pairs:enjs:format
  :~  ['type' s+'object']
      :-  'properties'
      :-  %o
      %-  ~(gas by *(map @t json))
      %+  turn  fields
      |=  [name=@t type=@t desc=@t required=?]
      [name (pairs:enjs:format ~[['type' s+type] ['description' s+desc]])]
      :-  'required'
      :-  %a
      %+  murn  fields
      |=  [name=@t type=@t desc=@t required=?]
      ?.(required ~ `s+name)
  ==
::  JSON-RPC envelopes
::
++  result
  |=  [id=json res=json]
  ^-  json
  (pairs:enjs:format ~[['jsonrpc' s+'2.0'] ['id' id] ['result' res]])
++  error
  |=  [id=json code=@ud message=@t]
  ^-  json
  %-  pairs:enjs:format
  :~  ['jsonrpc' s+'2.0']
      ['id' id]
      ['error' (pairs:enjs:format ~[['code' n+(crip (weld "-" (a-co:co code)))] ['message' s+message]])]
  ==
++  initialize
  |=  [id=json our=@p]
  ^-  json
  %+  result  id
  %-  pairs:enjs:format
  :~  ['protocolVersion' s+protocol-version]
      :-  'capabilities'
      (pairs:enjs:format ~[['tools' (pairs:enjs:format ~[['listChanged' b+|]])]])
      :-  'serverInfo'
      (pairs:enjs:format ~[['name' s+(rap 3 (scot %p our) ' browser' ~)] ['version' s+server-version]])
      ['instructions' s+instructions]
  ==
++  instructions
  '''
  Headless browser running on an Urbit ship. Call browser_navigate with a URL, read the outline, then act on refs (e7 etc.) with browser_click, browser_type and browser_select. Results are paged; ask for page=2 when a result says more pages exist. Use browser_text to read long articles, browser_metadata for page facts, browser_wait for content that appears later, browser_login to sign in with operator-stored credentials. Keep one context per task.
  '''
++  text-result
  |=  [id=json text=@t is-error=?]
  ^-  json
  %+  result  id
  %-  pairs:enjs:format
  :~  ['content' a+~[(pairs:enjs:format ~[['type' s+'text'] ['text' s+text]])]]
      ['isError' b+is-error]
  ==
::  +paginate: split lines into pages of at most `bytes` bytes
::
++  paginate
  |=  [lines=(list @t) page=@ud bytes=@ud]
  ^-  [body=@t page=@ud pages=@ud first=@ud last=@ud total=@ud]
  =/  total  (lent lines)
  =/  pages=(list (list @t))
    =|  cur=(list @t)
    =|  size=@ud
    =|  out=(list (list @t))
    |-  ^-  (list (list @t))
    ?~  lines  (flop ?~(cur out [(flop cur) out]))
    =/  n  +((met 3 i.lines))
    ?:  &(!=(~ cur) (gth (add size n) bytes))
      $(out [(flop cur) out], cur ~, size 0)
    $(lines t.lines, cur [i.lines cur], size (add size n))
  =/  count  (max 1 (lent pages))
  =/  p  (min (max 1 page) count)
  =/  chosen=(list @t)  ?:(=(~ pages) ~ (snag (dec p) pages))
  =/  first=@ud
    =/  before  (scag (dec p) pages)
    +((roll (turn before lent) add))
  =/  last  (add (dec first) (lent chosen))
  :*  (rap 3 (join '\0a' chosen))
      p  count  first  last  total
  ==
::  +page-text: paginate a large cord at line boundaries
::
++  page-text
  |=  [text=@t page=@ud bytes=@ud]
  ^-  [body=@t page=@ud pages=@ud]
  =/  lines  (to-wain:format text)
  =/  r  (paginate lines page bytes)
  [body.r page.r pages.r]
--
