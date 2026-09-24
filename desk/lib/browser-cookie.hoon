::  browser-cookie: a per-context cookie jar (RFC 6265, the useful parts)
::
/-  *browser
/+  url=browser-url
|%
::  +parse: a Set-Cookie value (or document.cookie assignment) into a cookie
::
++  parse
  |=  [raw=@t request=parts:url now=@da]
  ^-  (unit cookie)
  =/  segs=(list tape)  (split-on:url ";" (trip raw))
  ?~  segs  ~
  =/  eq  (find "=" i.segs)
  =/  name=tape  (trim-ws ?~(eq "" (scag u.eq i.segs)))
  =/  value=tape  (trim-ws ?~(eq i.segs (slag +(u.eq) i.segs)))
  ?:  =(~ name)  ~
  =/  default-path=@t
    =/  p  (trip path.request)
    =/  last  (flop (fand "/" p))
    ?~  last  '/'
    ?:  =(0 i.last)  '/'
    (crip (scag i.last p))
  =/  ck=cookie  [(crip name) (crip value) host.request default-path | | & ~]
  =/  max-age=(unit @dr)  ~
  =/  negative=?  |
  =/  expires=(unit @da)  ~
  |-  ^-  (unit cookie)
  ?~  t.segs
    =?  expires  ?=(^ max-age)  `(add now u.max-age)
    =?  expires  negative  `*@da
    `ck(expires expires)
  =/  attr=tape  (trim-ws i.t.segs)
  =/  ai  (find "=" attr)
  =/  key=tape  (cass (trim-ws ?~(ai attr (scag u.ai attr))))
  =/  val=tape  (trim-ws ?~(ai "" (slag +(u.ai) attr)))
  ?:  =("secure" key)  $(t.segs t.t.segs, secure.ck &)
  ?:  =("httponly" key)  $(t.segs t.t.segs, http-only.ck &)
  ?:  =("path" key)
    ?:  &(?=(^ val) =('/' i.val))  $(t.segs t.t.segs, path.ck (crip val))
    $(t.segs t.t.segs)
  ?:  =("domain" key)
    =/  dom=tape  (cass ?:(&(?=(^ val) =('.' i.val)) t.val val))
    ?~  dom  $(t.segs t.t.segs)
    ::  the request host must be the domain or a subdomain of it
    ?.  (domain-match host.request (crip dom))  ~
    $(t.segs t.t.segs, domain.ck (crip dom), host-only.ck |)
  ?:  =("max-age" key)
    =/  n  (rush (crip val) ;~(pose ;~(pfix hep (cook |=(a=@ `(each @ @)`[%| a]) dem)) (cook |=(a=@ `(each @ @)`[%& a]) dem)))
    ?~  n  $(t.segs t.t.segs)
    ?:  ?=(%| -.u.n)  $(t.segs t.t.segs, negative &)
    ?:  =(0 p.u.n)  $(t.segs t.t.segs, negative &)
    $(t.segs t.t.segs, max-age `(mul p.u.n ~s1))
  ?:  =("expires" key)
    =/  d  (parse-date val)
    ?~  d  $(t.segs t.t.segs)
    $(t.segs t.t.segs, expires ?~(expires d expires))
  $(t.segs t.t.segs)
::  +domain-match: host equals domain or ends with .domain
::
++  domain-match
  |=  [host=@t domain=@t]
  ^-  ?
  ?:  =(host domain)  &
  =/  h  (trip host)
  =/  d  (trip domain)
  =/  n  (lent d)
  ?:  (lte (lent h) n)  |
  ?.  =((slag (sub (lent h) +(n)) h) ['.' d])  |
  ::  never match a bare public suffix like "com"
  ?=(^ (find "." d))
++  path-match
  |=  [request=@t cookie-path=@t]
  ^-  ?
  ?:  =(request cookie-path)  &
  =/  r  (trip request)
  =/  c  (trip cookie-path)
  =/  n  (lent c)
  ?:  (lth (lent r) n)  |
  ?.  =((scag n r) c)  |
  ?:  =('/' (rear c))  &
  ?:  (gth (lent r) n)  =('/' (snag n r))
  |
::  +store: insert or replace a cookie in a jar
::
++  store
  |=  [jar=(list cookie) c=cookie now=@da]
  ^-  (list cookie)
  =/  rest
    %+  skip  jar
    |=  o=cookie
    &(=(name.o name.c) =(domain.o domain.c) =(path.o path.c))
  ?:  &(?=(^ expires.c) (lte u.expires.c now))  rest
  (snoc rest c)
::  +for-request: cookies to send for a URL, most specific path first
::
++  for-request
  |=  [jar=(list cookie) request=parts:url now=@da include-http-only=?]
  ^-  (list cookie)
  =/  hits
    %+  skim  jar
    |=  c=cookie
    ?&  ?:(host-only.c =(domain.c host.request) (domain-match host.request domain.c))
        (path-match path.request path.c)
        |(!secure.c secure.request)
        |(include-http-only !http-only.c)
        ?~(expires.c & (gth u.expires.c now))
    ==
  %+  sort  hits
  |=  [a=cookie b=cookie]
  (gth (met 3 path.a) (met 3 path.b))
++  header
  |=  cookies=(list cookie)
  ^-  @t
  %+  rap  3
  %+  join  '; '
  (turn cookies |=(c=cookie (rap 3 name.c '=' value.c ~)))
::  +absorb: parse raw Set-Cookie values against a request and store them
::
++  absorb
  |=  [jar=(list cookie) raws=(list @t) request=parts:url now=@da]
  ^-  (list cookie)
  %+  roll  raws
  |=  [raw=@t acc=_jar]
  =/  got  (parse raw request now)
  ?~  got  acc
  (store acc u.got now)
++  trim-ws  trim:url
::  +parse-date: HTTP dates such as "Wed, 21 Oct 2015 07:28:00 GMT"
::
++  parse-date
  |=  t=tape
  ^-  (unit @da)
  =/  toks=(list tape)  (skip (split-on:url " ,-\09" t) |=(s=tape =(~ s)))
  =|  day=(unit @ud)
  =|  month=(unit @ud)
  =|  yr=(unit @ud)
  =|  time=(unit [@ud @ud @ud])
  |-  ^-  (unit @da)
  ?~  toks
    ?.  &(?=(^ day) ?=(^ month) ?=(^ yr) ?=(^ time))  ~
    =/  y  ?:((lth u.yr 100) ?:((lth u.yr 70) (add 2.000 u.yr) (add 1.900 u.yr)) u.yr)
    =/  [h=@ud mi=@ud sec=@ud]  u.time
    ?:  |(=(0 u.day) (gth u.day 31) (gth h 23) (gth mi 59) (gth sec 60))  ~
    `(year [[& y] u.month [u.day h mi sec ~]])
  =/  tok  (cass i.toks)
  =/  hms  (rush (crip tok) ;~((glue col) dem dem dem))
  ?^  hms  $(toks t.toks, time ?~(time `u.hms time))
  =/  num  (rush (crip tok) dem)
  ?^  num
    ?:  &(?=(~ day) (lte u.num 31) (lte (lent tok) 2))  $(toks t.toks, day num)
    ?:  ?=(~ yr)  $(toks t.toks, yr num)
    $(toks t.toks)
  =/  mon=(unit @ud)
    =/  names=(list tape)  ~["jan" "feb" "mar" "apr" "may" "jun" "jul" "aug" "sep" "oct" "nov" "dec"]
    =/  three=tape  (scag 3 tok)
    =/  i=@ud  1
    |-  ^-  (unit @ud)
    ?~  names  ~
    ?:  =(i.names three)  `i
    $(names t.names, i +(i))
  ?^  mon  $(toks t.toks, month ?~(month mon month))
  $(toks t.toks)
--
