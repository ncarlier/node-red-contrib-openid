/**
 * Copyright 2017 Nicolas Carlier
 *
 * Licensed under the Apache License, Version 2.0 (the 'License')
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
  'use strict'

  const Issuer = require('openid-client').Issuer
  const crypto = require('crypto')

  function OpenIDNode (n) {
    RED.nodes.createNode(this, n)
  }

  RED.nodes.registerType('openid-credentials', OpenIDNode, {
    credentials: {
      display_name:  {type: 'text'},
      discovery_url: {type: 'text'},
      client_id:     {type: 'text'},
      client_secret: {type: 'password'},
      id_token:      {type: 'password'},
      refresh_token: {type: 'password'},
      access_token:  {type: 'password'},
      expires_at:    {type: 'text'}
    }
  })

  RED.httpAdmin.get('/openid-credentials/auth', function (req, res) {
    if (!req.query.discovery || !req.query.clientId || !req.query.clientSecret || !req.query.id || !req.query.callback) {
      res.send(400)
      return
    }
    const node_id = req.query.id
    const discovery_url = req.query.discovery
    const redirect_uri = req.query.callback
    const client_id = req.query.clientId
    const client_secret = req.query.clientSecret

    Issuer.discover(discovery_url).then((issuer) => {
      const csrf_token = crypto.randomBytes(18).toString('base64').replace(/\//g, '-').replace(/\+/g, '_')
      const client = new issuer.Client({client_id, client_secret})
      const authorization_url = client.authorizationUrl({
        redirect_uri,
        scope: 'openid email offline_access',
        state: `${node_id}:${csrf_token}`,
        access_type: 'offline'
      })
      res.cookie('csrf', csrf_token)
      res.redirect(authorization_url)
      RED.nodes.addCredentials(node_id, {
        discovery_url, client_id, client_secret, redirect_uri, csrf_token
      })
    }, (err) => {
      console.log('Discover error %j', err)
      return res.send(RED._('openid.error.bad-discovery-url'))
    })
  })

  RED.httpAdmin.get('/openid-credentials/auth/callback', function (req, res) {
    if (req.query.error) {
      return res.send('ERROR: ' + req.query.error + ': ' + req.query.error_description)
    }
    const state = req.query.state.split(':')
    const node_id = state[0]
    const credentials = RED.nodes.getCredentials(node_id)
    if (!credentials || !credentials.client_id || !credentials.client_secret) {
      return res.send(RED._('openid.error.no-credentials'))
    }
    // console.log('Credentials:' + JSON.stringify(credentials))
    // console.log('Query:' + JSON.stringify(req.query))
    if (state[1] !== credentials.csrf_token) {
      return res.status(401).send(
        RED._('openid.error.token-mismatch')
      )
    }

    Issuer.discover(credentials.discovery_url).then(issuer => {
      const client = new issuer.Client(credentials)
      client.authorizationCallback(credentials.redirect_uri, {code: req.query.code}).then((tokenSet) => {
        RED.nodes.addCredentials(node_id, Object.assign({}, credentials, {
          id_token: tokenSet.id_token,
          refresh_token: tokenSet.refresh_token,
          access_token: tokenSet.access_token,
          expires_at: tokenSet.expires_at,
          display_name: tokenSet.claims.prefered_username || tokenSet.claims.email
        }))
        return res.send(RED._('openid.error.authorized'))
      }, err => {
        console.log('OpenID err:', err)
        return res.send(RED._('openid.error.something-broke'))
      })
    }, err => {
      console.log('Discover error %j', err)
      return res.send(RED._('openid.error.bad-discovery-url'))
    })
  })

  function OpenIDRequestNode (n) {
    RED.nodes.createNode(this, n)
    this.openid = RED.nodes.getNode(n.openid)
    if (!this.openid || !this.openid.credentials.access_token) {
      this.warn(RED._('openid.warn.missing-credentials'))
      return
    }
    let issuer = null
    Issuer.discover(this.openid.credentials.discovery_url).then(iss => {
      issuer = iss
    }, err => {
      this.error(RED._('openid.error.bad-discovery_url'))
      console.log('Discover error %j', err)
      return
    })

    this.on('input', msg => {
      // Refresh the access token if expired
      const expires_at = this.openid.credentials.expires_at
      const now = new Date()
      now.setSeconds(now.getSeconds() + 30)
      const current_time = Math.floor(now.getTime() / 1000)
      let token_is_valid = Promise.resolve()
      if (current_time > expires_at) {
        this.status({fill: 'blue', shape: 'dot', text: 'openid.status.refreshing'})
        const refresh_token = this.openid.credentials.refresh_token
        const oidcClient = new issuer.Client(this.openid.credentials)
        token_is_valid = oidcClient.refresh(refresh_token).then(tokenSet => {
          this.openid.credentials.access_token = tokenSet.access_token
          this.openid.credentials.expires_at = tokenSet.expires_at
          RED.nodes.addCredentials(this.id, this.openid.credentials)
          return Promise.resolve()
        }, err => {
          this.error(RED._('openid.error.refresh-failed', {err: JSON.stringify(err)}))
          this.status({fill: 'red', shape: 'ring', text: 'openid.status.failed'})
          msg.payload = err
          msg.error = err
          this.send(msg)
          return Promise.reject(err)
        })
      }

      token_is_valid.then(() => {
        delete msg.error
        msg.access_token = this.openid.credentials.access_token
        const headers = msg.headers || {}
        headers['Authorization'] = `Bearer ${msg.access_token}`
        msg.headers = headers
        this.status({})
        this.send(msg)
      })
    })
  }
  RED.nodes.registerType('openid', OpenIDRequestNode)
}
