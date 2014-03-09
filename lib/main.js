/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const tabs = require('sdk/tabs');
const { data } = require('sdk/self');
const { ToggleButton } = require("sdk/ui/button/toggle");
const { on } = require('sdk/event/core');
const { URL } = require('sdk/url');
const { isPrivate } = require('sdk/private-browsing');
const { defer } = require('sdk/core/promise');
const { when: unload } = require('sdk/system/unload');

const { Redirect } = require('pathfinder/redirect');
let redirects = {};
unload(_ => {
  Array.slice(redirects).forEach(r => r.dispose());
  redirects = {};
});

const { Database } = require('./database');

const BUTTON_ID = 'domain-security-jetpack-button';
const ICON_ON = { 16: './on.gif' };
const ICON_OFF = { 16: './off.gif' };

let button = ToggleButton({
  id: BUTTON_ID,
  label: "Not Locked",
  icon: ICON_OFF,
  onClick: function() {
    let tab = tabs.activeTab;
    if (!tab) return;
    let domain = URL(tab.url).host;
    if (!domain) return;
    let options = { domain: domain };
    let tabIsPrivate = isPrivate(tab);
    let redirect = redirects[domain];

    if (tabIsPrivate && redirect) {
      redirects[domain].dispose();
      delete redirects[domain];
      updateTabStates(domain, false);
    }

    Database.get(options).
      then(has => {
        // if turning off always ok,
        // otherwise if private then make
        // the redirect last for the
        // session only
        if (tabIsPrivate && !redirect && !has) {
          addRedirect(domain);
        }
        else {
          Database[(!has && !tabIsPrivate) ? 'add' : 'remove']({ domains: [ domain ] })
        }
      }).then(null, console.exception);
  }
});

function addRedirect(domain) {
  if (!redirects[domain]) {
    redirects[domain] = Redirect({
      from: new RegExp('^http:\/\/' + domain + '\/'),
      secure: true
    });
  }
  updateTabStates(domain, true);
}

Database.getAll().then(domains => {
  Object.keys(domains).forEach(addRedirect);
});

on(Database, "domain:add", addRedirect);

on(Database, "domain:remove", domain => {
  let redirect = redirects[domain];
  if (redirect) {
    delete redirects[domain];
    redirect.dispose();
  }
  updateTabStates(domain, false);
});

function updateTabStates(domain, state) {
  for each (let tab in tabs) {
    let tabURL = URL(tab.url);
    let { host, scheme } = tabURL;
    if (host == domain) {
      button.state(tab, {
        icon: state ? ICON_ON : ICON_OFF,
        label: state ? "Locked" : "Not Locked"
      });

      if (state) {
        if (scheme == 'http') {
          tab.url = tabURL.toString().replace(/^http:/, 'https:');
        }
      }
    }
  }
}

function onReady(tab) {
  let domain = URL(tab.url).host;
  if (!domain) return;
  let on = !!redirects[domain];
  button.state(tab, {
    icon: on ? ICON_ON : ICON_OFF
    label: state ? "Locked" : "Not Locked"
  });
}
tabs.on('ready', onReady);
tabs.on('activate', onReady);
