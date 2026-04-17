// lib/meta-pixel.js — Meta Pixel loader + auto PageView
// Pixel ID is set in window.META_PIXEL_ID BEFORE this file loads.
// If no pixel ID set, all Pixel calls are no-ops (safe for dev).

(function() {
  'use strict';
  const PIXEL_ID = window.META_PIXEL_ID;
  if (!PIXEL_ID || PIXEL_ID === 'REPLACE_WITH_REAL_PIXEL_ID') {
    window.fbq = function() {};
    return;
  }

  !function(f,b,e,v,n,t,s){
    if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)
  }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');

  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
})();
