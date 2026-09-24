::  browser-url: http(s) URL splitting, resolution and host policy
::
|%
+$  parts
  $:  secure=?
      host=@t              ::  lowercase
      port=(unit @ud)
      path=@t              ::  begins with /
      query=@t             ::  '' or begins with ?
  ==
::  +split: parse an absolute http(s) URL
::
++  split
  |=  url=@t
  ^-  (unit parts)
  =/  tap=tape  (trip url)
  =/  low=tape  (cass (scag 8 tap))
  =/  secure=(unit ?)
    ?:  =("https://" low)  `&
    ?:  =("http://" (scag 7 low))  `|
    ~
  ?~  secure  ~
  =/  rest=tape  (slag ?:(u.secure 8 7) tap)
  =/  auth-end=@ud
    =/  i=@ud  0
    |-  ^-  @ud
    ?:  (gte i (lent rest))  i
    =/  c  (snag i rest)
    ?:  |(=(c '/') =(c '?') =(c '#'))  i
    $(i +(i))
  =/  authority=tape  (scag auth-end rest)
  =/  tail=tape  (slag auth-end rest)
  ::  strip userinfo
  =.  authority
    =/  at  (find "@" authority)
    ?~  at  authority
    (slag +(u.at) authority)
  ?:  =(~ authority)  ~
  =/  hostport=[host=tape port=(unit @ud)]
    ?:  =('[' (snag 0 authority))
      =/  close  (find "]" authority)
      ?~  close  [authority ~]
      =/  h  (scag +(u.close) authority)
      =/  p  (slag +(u.close) authority)
      :-  h
      ?:  &(?=(^ p) =(':' i.p))  (rush (crip t.p) dem)
      ~
    =/  col  (find ":" authority)
    ?~  col  [authority ~]
    :-  (scag u.col authority)
    (rush (crip (slag +(u.col) authority)) dem)
  ?:  =(~ host.hostport)  ~
  ::  drop a fragment, split query
  =/  no-frag=tape
    =/  h  (find "#" tail)
    ?~  h  tail
    (scag u.h tail)
  =/  qi  (find "?" no-frag)
  =/  path=tape  ?~(qi no-frag (scag u.qi no-frag))
  =/  query=tape  ?~(qi "" (slag u.qi no-frag))
  =?  path  ?=(~ path)  "/"
  =/  port=(unit @ud)
    ?~  port.hostport  ~
    ?:  =(u.port.hostport ?:(u.secure 443 80))  ~
    port.hostport
  `[u.secure (crip (cass host.hostport)) port (crip path) (crip query)]
::  +render: parts back to a URL
::
++  render
  |=  p=parts
  ^-  @t
  %+  rap  3
  :~  ?:(secure.p 'https://' 'http://')
      host.p
      ?~(port.p '' (cat 3 ':' (crip (a-co:co u.port.p))))
      path.p
      query.p
  ==
++  origin
  |=  p=parts
  ^-  @t
  (rap 3 ?:(secure.p 'https://' 'http://') host.p ?~(port.p '' (cat 3 ':' (crip (a-co:co u.port.p)))) ~)
::  +resolve: a (possibly relative) reference against a base
::
++  resolve
  |=  [base=parts raw=@t]
  ^-  (unit parts)
  =/  ref=tape  (trim (trip raw))
  ?:  =(~ ref)  `base(query '')
  ?^  (split (crip ref))  (split (crip ref))
  ?:  ?=(^ (find "://" (scag 12 ref)))  ~          ::  other scheme
  ?:  =("//" (scag 2 ref))
    (split (rap 3 ?:(secure.base 'https:' 'http:') (crip ref) ~))
  =/  h  (find "#" ref)
  =/  clean=tape  ?~(h ref (scag u.h ref))
  =/  qi  (find "?" clean)
  =/  qpath=tape  ?~(qi clean (scag u.qi clean))
  =/  query=@t  ?~(qi '' (crip (slag u.qi clean)))
  ?:  =("#" (scag 1 ref))  `base
  ?:  =("?" (scag 1 ref))  `base(query query)
  ?:  =("/" (scag 1 ref))
    `base(path (crip (normalize qpath)), query query)
  ::  relative path: directory of the base path plus the reference
  =/  bpath=tape  (trip path.base)
  =/  dir=tape
    =/  last  (flop (fand "/" bpath))
    ?~  last  "/"
    (scag +(i.last) bpath)
  `base(path (crip (normalize (weld dir qpath))), query query)
::  +trim: strip surrounding whitespace
::
++  trim
  |=  t=tape
  ^-  tape
  =/  ws  |=(c=@t |(=(c ' ') =(c '\09') =(c '\0a') =(c '\0d')))
  =/  front=tape
    |-  ^-  tape
    ?~  t  t
    ?:((ws i.t) $(t t.t) t)
  %-  flop
  =/  back=tape  (flop front)
  |-  ^-  tape
  ?~  back  back
  ?:((ws i.back) $(back t.back) back)
::  +normalize: remove . and .. segments
::
++  normalize
  |=  path=tape
  ^-  tape
  =/  segs=(list tape)  (segments path)
  =|  out=(list tape)
  |-  ^-  tape
  ?~  segs
    =/  joined=tape  (zing (turn (flop out) |=(s=tape `tape`['/' s])))
    ?:  =(~ joined)  "/"
    ?:  &(?=(^ path) =('/' (rear `tape`path)))  (snoc joined '/')
    joined
  ?:  =(".." i.segs)
    =?  out  ?=(^ out)  t.out
    ?~  t.segs  $(segs t.segs, path (snoc path '/'))
    $(segs t.segs)
  ?:  =("." i.segs)
    ?~  t.segs  $(segs t.segs, path (snoc path '/'))
    $(segs t.segs)
  ?~  i.segs  $(segs t.segs)
  $(segs t.segs, out [i.segs out])
++  segments
  |=  path=tape
  ^-  (list tape)
  =|  cur=tape
  =|  out=(list tape)
  |-  ^-  (list tape)
  ?~  path  (flop [(flop cur) out])
  ?:  =('/' i.path)  $(path t.path, out [(flop cur) out], cur ~)
  $(path t.path, cur [i.path cur])
::  +private: loopback, private and local hosts
::
++  private
  |=  host=@t
  ^-  ?
  =/  tap  (trip host)
  ?:  =("localhost" tap)  &
  ?:  ?=(^ (find ".localhost" tap))  &
  ?:  =("0.0.0.0" tap)  &
  =/  suf
    |=  s=tape
    ^-  ?
    =/  n  (lent s)
    ?:  (lth (lent tap) n)  |
    =((slag (sub (lent tap) n) tap) s)
  ?:  |((suf ".local") (suf ".internal") (suf ".home.arpa") (suf ".lan") (suf ".corp") (suf ".home"))  &
  ?:  =('[' (snag 0 tap))
    =/  inner  (cass (scag (dec (lent tap)) (slag 1 tap)))
    ?:  |(=("::1" inner) =("::" inner))  &
    ?:  |(=("fe80" (scag 4 inner)) =("fc" (scag 2 inner)) =("fd" (scag 2 inner)) =("::ffff:127" (scag 10 inner)))  &
    |
  =/  quad  (rush host ;~((glue dot) dem dem dem dem))
  ?~  quad  |
  =/  [a=@ b=@ c=@ d=@]  u.quad
  ?|  =(a 10)
      =(a 127)
      =(a 0)
      &(=(a 172) (gte b 16) (lte b 31))
      &(=(a 192) =(b 168))
      &(=(a 169) =(b 254))
      &(=(a 100) (gte b 64) (lte b 127))
  ==
::  +match-pattern: 'example.com', '*.example.com' (self and subdomains), '*'
::
++  match-pattern
  |=  [pattern=@t host=@t]
  ^-  ?
  =/  pat  (cass (trip pattern))
  =/  hos  (trip host)
  ?:  =("*" pat)  &
  ?:  =("*." (scag 2 pat))
    =/  base  (slag 2 pat)
    ?:  =(base hos)  &
    =/  n  (lent base)
    ?:  (lte (lent hos) n)  |
    =((slag (sub (lent hos) +(n)) hos) ['.' base])
  =(pat hos)
--
