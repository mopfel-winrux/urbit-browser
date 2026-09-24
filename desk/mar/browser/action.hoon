/-  *browser
|_  act=action
++  grab
  |%
  ++  noun  action
  ++  json
    |=  jon=^json
    ^-  action
    =,  dejs:format
    =/  seconds  (cu |=(s=@ud (mul s ~s1)) ni)
    =/  device-fist
      %-  ot
      :~  [%width ni]
          [%height ni]
          [%mobile bo]
          [%user-agent so]
          [%locale so]
          [%timezone so]
      ==
    %.  jon
    %-  of
    :~  [%rotate-key ul]
        [%close-all ul]
        [%clear-cache ul]
        [%close-context so]
        [%clear-cookies so]
        [%drop-runtime so]
        [%del-credential so]
        [%set-credential (ot ~[[%origin so] [%username so] [%password so]])]
        [%set-proxy (ot ~[[%id so] [%proxy (mu so)]])]
        [%set-device (ot ~[[%id so] [%device device-fist]])]
        [%import-context (ot ~[[%id so] [%state same]])]
        :-  %set-policy
        %-  ot
        :~  [%allow (ar so)]
            [%deny (ar so)]
            [%block-private bo]
            [%block-hosts (ar so)]
            [%block-kinds (ar so)]
            [%max-body ni]
            [%max-redirects ni]
            [%js bo]
            [%css bo]
            [%js-gap seconds]
            [%max-script-bytes ni]
            [%max-css-bytes ni]
            [%max-subrequests ni]
            [%cache-scripts bo]
            [%cache-ttl seconds]
            [%max-cache ni]
            [%max-files ni]
            [%max-record ni]
            [%page-bytes ni]
            [%max-contexts ni]
            [%max-live ni]
            [%idle-expiry seconds]
            [%timeout seconds]
            [%user-agent so]
            [%accept-language so]
        ==
    ==
  --
++  grow
  |%
  ++  noun  act
  --
++  grad  %noun
--
