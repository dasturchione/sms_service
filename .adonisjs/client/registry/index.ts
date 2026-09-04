/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'client.token.store': {
    methods: ["POST"],
    pattern: '/api/v1/auth/token',
    tokens: [{"old":"/api/v1/auth/token","type":0,"val":"api","end":""},{"old":"/api/v1/auth/token","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/token","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/token","type":0,"val":"token","end":""}],
    types: placeholder as Registry['client.token.store']['types'],
  },
  'sms.store': {
    methods: ["POST"],
    pattern: '/api/v1/sms',
    tokens: [{"old":"/api/v1/sms","type":0,"val":"api","end":""},{"old":"/api/v1/sms","type":0,"val":"v1","end":""},{"old":"/api/v1/sms","type":0,"val":"sms","end":""}],
    types: placeholder as Registry['sms.store']['types'],
  },
  'sms.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/sms',
    tokens: [{"old":"/api/v1/sms","type":0,"val":"api","end":""},{"old":"/api/v1/sms","type":0,"val":"v1","end":""},{"old":"/api/v1/sms","type":0,"val":"sms","end":""}],
    types: placeholder as Registry['sms.index']['types'],
  },
  'sms.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/sms/:uid',
    tokens: [{"old":"/api/v1/sms/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/sms/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/sms/:uid","type":0,"val":"sms","end":""},{"old":"/api/v1/sms/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['sms.show']['types'],
  },
  'sms.cancel': {
    methods: ["POST"],
    pattern: '/api/v1/sms/:uid/cancel',
    tokens: [{"old":"/api/v1/sms/:uid/cancel","type":0,"val":"api","end":""},{"old":"/api/v1/sms/:uid/cancel","type":0,"val":"v1","end":""},{"old":"/api/v1/sms/:uid/cancel","type":0,"val":"sms","end":""},{"old":"/api/v1/sms/:uid/cancel","type":1,"val":"uid","end":""},{"old":"/api/v1/sms/:uid/cancel","type":0,"val":"cancel","end":""}],
    types: placeholder as Registry['sms.cancel']['types'],
  },
  'client.token.destroy': {
    methods: ["POST"],
    pattern: '/api/v1/auth/token/revoke',
    tokens: [{"old":"/api/v1/auth/token/revoke","type":0,"val":"api","end":""},{"old":"/api/v1/auth/token/revoke","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/token/revoke","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/token/revoke","type":0,"val":"token","end":""},{"old":"/api/v1/auth/token/revoke","type":0,"val":"revoke","end":""}],
    types: placeholder as Registry['client.token.destroy']['types'],
  },
  'gateway.register': {
    methods: ["POST"],
    pattern: '/api/v1/gw/register',
    tokens: [{"old":"/api/v1/gw/register","type":0,"val":"api","end":""},{"old":"/api/v1/gw/register","type":0,"val":"v1","end":""},{"old":"/api/v1/gw/register","type":0,"val":"gw","end":""},{"old":"/api/v1/gw/register","type":0,"val":"register","end":""}],
    types: placeholder as Registry['gateway.register']['types'],
  },
  'gateway.claim': {
    methods: ["POST"],
    pattern: '/api/v1/gw/claim',
    tokens: [{"old":"/api/v1/gw/claim","type":0,"val":"api","end":""},{"old":"/api/v1/gw/claim","type":0,"val":"v1","end":""},{"old":"/api/v1/gw/claim","type":0,"val":"gw","end":""},{"old":"/api/v1/gw/claim","type":0,"val":"claim","end":""}],
    types: placeholder as Registry['gateway.claim']['types'],
  },
  'gateway.provision': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/gw/provision',
    tokens: [{"old":"/api/v1/gw/provision","type":0,"val":"api","end":""},{"old":"/api/v1/gw/provision","type":0,"val":"v1","end":""},{"old":"/api/v1/gw/provision","type":0,"val":"gw","end":""},{"old":"/api/v1/gw/provision","type":0,"val":"provision","end":""}],
    types: placeholder as Registry['gateway.provision']['types'],
  },
  'gateway.sims.sync': {
    methods: ["POST"],
    pattern: '/api/v1/gw/sim-profiles',
    tokens: [{"old":"/api/v1/gw/sim-profiles","type":0,"val":"api","end":""},{"old":"/api/v1/gw/sim-profiles","type":0,"val":"v1","end":""},{"old":"/api/v1/gw/sim-profiles","type":0,"val":"gw","end":""},{"old":"/api/v1/gw/sim-profiles","type":0,"val":"sim-profiles","end":""}],
    types: placeholder as Registry['gateway.sims.sync']['types'],
  },
  'gateway.results': {
    methods: ["POST"],
    pattern: '/api/v1/gw/results',
    tokens: [{"old":"/api/v1/gw/results","type":0,"val":"api","end":""},{"old":"/api/v1/gw/results","type":0,"val":"v1","end":""},{"old":"/api/v1/gw/results","type":0,"val":"gw","end":""},{"old":"/api/v1/gw/results","type":0,"val":"results","end":""}],
    types: placeholder as Registry['gateway.results']['types'],
  },
  'auth.new_account.store': {
    methods: ["POST"],
    pattern: '/api/v1/auth/signup',
    tokens: [{"old":"/api/v1/auth/signup","type":0,"val":"api","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['auth.new_account.store']['types'],
  },
  'auth.access_tokens.store': {
    methods: ["POST"],
    pattern: '/api/v1/auth/login',
    tokens: [{"old":"/api/v1/auth/login","type":0,"val":"api","end":""},{"old":"/api/v1/auth/login","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/login","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.access_tokens.store']['types'],
  },
  'profile.profile.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/account/profile',
    tokens: [{"old":"/api/v1/account/profile","type":0,"val":"api","end":""},{"old":"/api/v1/account/profile","type":0,"val":"v1","end":""},{"old":"/api/v1/account/profile","type":0,"val":"account","end":""},{"old":"/api/v1/account/profile","type":0,"val":"profile","end":""}],
    types: placeholder as Registry['profile.profile.show']['types'],
  },
  'profile.access_tokens.destroy': {
    methods: ["POST"],
    pattern: '/api/v1/account/logout',
    tokens: [{"old":"/api/v1/account/logout","type":0,"val":"api","end":""},{"old":"/api/v1/account/logout","type":0,"val":"v1","end":""},{"old":"/api/v1/account/logout","type":0,"val":"account","end":""},{"old":"/api/v1/account/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['profile.access_tokens.destroy']['types'],
  },
  'admin.gateways.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/gateways',
    tokens: [{"old":"/api/v1/admin/gateways","type":0,"val":"api","end":""},{"old":"/api/v1/admin/gateways","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/gateways","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/gateways","type":0,"val":"gateways","end":""}],
    types: placeholder as Registry['admin.gateways.index']['types'],
  },
  'admin.gateways.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/gateways/:uid',
    tokens: [{"old":"/api/v1/admin/gateways/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/admin/gateways/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/gateways/:uid","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/gateways/:uid","type":0,"val":"gateways","end":""},{"old":"/api/v1/admin/gateways/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['admin.gateways.show']['types'],
  },
  'admin.gateways.approve': {
    methods: ["POST"],
    pattern: '/api/v1/admin/gateways/:uid/approve',
    tokens: [{"old":"/api/v1/admin/gateways/:uid/approve","type":0,"val":"api","end":""},{"old":"/api/v1/admin/gateways/:uid/approve","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/gateways/:uid/approve","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/gateways/:uid/approve","type":0,"val":"gateways","end":""},{"old":"/api/v1/admin/gateways/:uid/approve","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/gateways/:uid/approve","type":0,"val":"approve","end":""}],
    types: placeholder as Registry['admin.gateways.approve']['types'],
  },
  'admin.gateways.disable': {
    methods: ["POST"],
    pattern: '/api/v1/admin/gateways/:uid/disable',
    tokens: [{"old":"/api/v1/admin/gateways/:uid/disable","type":0,"val":"api","end":""},{"old":"/api/v1/admin/gateways/:uid/disable","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/gateways/:uid/disable","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/gateways/:uid/disable","type":0,"val":"gateways","end":""},{"old":"/api/v1/admin/gateways/:uid/disable","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/gateways/:uid/disable","type":0,"val":"disable","end":""}],
    types: placeholder as Registry['admin.gateways.disable']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
