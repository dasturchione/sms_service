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
  'sms.batch': {
    methods: ["POST"],
    pattern: '/api/v1/sms/batch',
    tokens: [{"old":"/api/v1/sms/batch","type":0,"val":"api","end":""},{"old":"/api/v1/sms/batch","type":0,"val":"v1","end":""},{"old":"/api/v1/sms/batch","type":0,"val":"sms","end":""},{"old":"/api/v1/sms/batch","type":0,"val":"batch","end":""}],
    types: placeholder as Registry['sms.batch']['types'],
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
  'reports.daily': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/reports/daily',
    tokens: [{"old":"/api/v1/reports/daily","type":0,"val":"api","end":""},{"old":"/api/v1/reports/daily","type":0,"val":"v1","end":""},{"old":"/api/v1/reports/daily","type":0,"val":"reports","end":""},{"old":"/api/v1/reports/daily","type":0,"val":"daily","end":""}],
    types: placeholder as Registry['reports.daily']['types'],
  },
  'reports.summary': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/reports/summary',
    tokens: [{"old":"/api/v1/reports/summary","type":0,"val":"api","end":""},{"old":"/api/v1/reports/summary","type":0,"val":"v1","end":""},{"old":"/api/v1/reports/summary","type":0,"val":"reports","end":""},{"old":"/api/v1/reports/summary","type":0,"val":"summary","end":""}],
    types: placeholder as Registry['reports.summary']['types'],
  },
  'balances.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/balances',
    tokens: [{"old":"/api/v1/balances","type":0,"val":"api","end":""},{"old":"/api/v1/balances","type":0,"val":"v1","end":""},{"old":"/api/v1/balances","type":0,"val":"balances","end":""}],
    types: placeholder as Registry['balances.index']['types'],
  },
  'webhooks.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/webhooks',
    tokens: [{"old":"/api/v1/webhooks","type":0,"val":"api","end":""},{"old":"/api/v1/webhooks","type":0,"val":"v1","end":""},{"old":"/api/v1/webhooks","type":0,"val":"webhooks","end":""}],
    types: placeholder as Registry['webhooks.index']['types'],
  },
  'webhooks.store': {
    methods: ["POST"],
    pattern: '/api/v1/webhooks',
    tokens: [{"old":"/api/v1/webhooks","type":0,"val":"api","end":""},{"old":"/api/v1/webhooks","type":0,"val":"v1","end":""},{"old":"/api/v1/webhooks","type":0,"val":"webhooks","end":""}],
    types: placeholder as Registry['webhooks.store']['types'],
  },
  'webhooks.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/webhooks/:uid',
    tokens: [{"old":"/api/v1/webhooks/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/webhooks/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/webhooks/:uid","type":0,"val":"webhooks","end":""},{"old":"/api/v1/webhooks/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['webhooks.show']['types'],
  },
  'webhooks.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/webhooks/:uid',
    tokens: [{"old":"/api/v1/webhooks/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/webhooks/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/webhooks/:uid","type":0,"val":"webhooks","end":""},{"old":"/api/v1/webhooks/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['webhooks.update']['types'],
  },
  'webhooks.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/webhooks/:uid',
    tokens: [{"old":"/api/v1/webhooks/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/webhooks/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/webhooks/:uid","type":0,"val":"webhooks","end":""},{"old":"/api/v1/webhooks/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['webhooks.destroy']['types'],
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
  'admin.overview': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/overview',
    tokens: [{"old":"/api/v1/admin/overview","type":0,"val":"api","end":""},{"old":"/api/v1/admin/overview","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/overview","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/overview","type":0,"val":"overview","end":""}],
    types: placeholder as Registry['admin.overview']['types'],
  },
  'admin.tenants.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/tenants',
    tokens: [{"old":"/api/v1/admin/tenants","type":0,"val":"api","end":""},{"old":"/api/v1/admin/tenants","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/tenants","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/tenants","type":0,"val":"tenants","end":""}],
    types: placeholder as Registry['admin.tenants.index']['types'],
  },
  'admin.tenants.store': {
    methods: ["POST"],
    pattern: '/api/v1/admin/tenants',
    tokens: [{"old":"/api/v1/admin/tenants","type":0,"val":"api","end":""},{"old":"/api/v1/admin/tenants","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/tenants","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/tenants","type":0,"val":"tenants","end":""}],
    types: placeholder as Registry['admin.tenants.store']['types'],
  },
  'admin.tenants.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/tenants/:uid',
    tokens: [{"old":"/api/v1/admin/tenants/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/admin/tenants/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/tenants/:uid","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/tenants/:uid","type":0,"val":"tenants","end":""},{"old":"/api/v1/admin/tenants/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['admin.tenants.show']['types'],
  },
  'admin.tenants.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/admin/tenants/:uid',
    tokens: [{"old":"/api/v1/admin/tenants/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/admin/tenants/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/tenants/:uid","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/tenants/:uid","type":0,"val":"tenants","end":""},{"old":"/api/v1/admin/tenants/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['admin.tenants.update']['types'],
  },
  'admin.clients.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/tenants/:uid/clients',
    tokens: [{"old":"/api/v1/admin/tenants/:uid/clients","type":0,"val":"api","end":""},{"old":"/api/v1/admin/tenants/:uid/clients","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/tenants/:uid/clients","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/tenants/:uid/clients","type":0,"val":"tenants","end":""},{"old":"/api/v1/admin/tenants/:uid/clients","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/tenants/:uid/clients","type":0,"val":"clients","end":""}],
    types: placeholder as Registry['admin.clients.index']['types'],
  },
  'admin.clients.store': {
    methods: ["POST"],
    pattern: '/api/v1/admin/tenants/:uid/clients',
    tokens: [{"old":"/api/v1/admin/tenants/:uid/clients","type":0,"val":"api","end":""},{"old":"/api/v1/admin/tenants/:uid/clients","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/tenants/:uid/clients","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/tenants/:uid/clients","type":0,"val":"tenants","end":""},{"old":"/api/v1/admin/tenants/:uid/clients","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/tenants/:uid/clients","type":0,"val":"clients","end":""}],
    types: placeholder as Registry['admin.clients.store']['types'],
  },
  'admin.clients.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/admin/tenants/:uid/clients/:clientUid',
    tokens: [{"old":"/api/v1/admin/tenants/:uid/clients/:clientUid","type":0,"val":"api","end":""},{"old":"/api/v1/admin/tenants/:uid/clients/:clientUid","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/tenants/:uid/clients/:clientUid","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/tenants/:uid/clients/:clientUid","type":0,"val":"tenants","end":""},{"old":"/api/v1/admin/tenants/:uid/clients/:clientUid","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/tenants/:uid/clients/:clientUid","type":0,"val":"clients","end":""},{"old":"/api/v1/admin/tenants/:uid/clients/:clientUid","type":1,"val":"clientUid","end":""}],
    types: placeholder as Registry['admin.clients.update']['types'],
  },
  'admin.webhooks.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/tenants/:uid/webhooks',
    tokens: [{"old":"/api/v1/admin/tenants/:uid/webhooks","type":0,"val":"api","end":""},{"old":"/api/v1/admin/tenants/:uid/webhooks","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/tenants/:uid/webhooks","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/tenants/:uid/webhooks","type":0,"val":"tenants","end":""},{"old":"/api/v1/admin/tenants/:uid/webhooks","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/tenants/:uid/webhooks","type":0,"val":"webhooks","end":""}],
    types: placeholder as Registry['admin.webhooks.index']['types'],
  },
  'admin.reports.daily': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/reports/daily',
    tokens: [{"old":"/api/v1/admin/reports/daily","type":0,"val":"api","end":""},{"old":"/api/v1/admin/reports/daily","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/reports/daily","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/reports/daily","type":0,"val":"reports","end":""},{"old":"/api/v1/admin/reports/daily","type":0,"val":"daily","end":""}],
    types: placeholder as Registry['admin.reports.daily']['types'],
  },
  'admin.staff.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/staff',
    tokens: [{"old":"/api/v1/admin/staff","type":0,"val":"api","end":""},{"old":"/api/v1/admin/staff","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/staff","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/staff","type":0,"val":"staff","end":""}],
    types: placeholder as Registry['admin.staff.index']['types'],
  },
  'admin.staff.store': {
    methods: ["POST"],
    pattern: '/api/v1/admin/staff',
    tokens: [{"old":"/api/v1/admin/staff","type":0,"val":"api","end":""},{"old":"/api/v1/admin/staff","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/staff","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/staff","type":0,"val":"staff","end":""}],
    types: placeholder as Registry['admin.staff.store']['types'],
  },
  'admin.staff.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/admin/staff/:uid',
    tokens: [{"old":"/api/v1/admin/staff/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/admin/staff/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/staff/:uid","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/staff/:uid","type":0,"val":"staff","end":""},{"old":"/api/v1/admin/staff/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['admin.staff.update']['types'],
  },
  'admin.messages.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/messages',
    tokens: [{"old":"/api/v1/admin/messages","type":0,"val":"api","end":""},{"old":"/api/v1/admin/messages","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/messages","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/messages","type":0,"val":"messages","end":""}],
    types: placeholder as Registry['admin.messages.index']['types'],
  },
  'admin.messages.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/messages/:uid',
    tokens: [{"old":"/api/v1/admin/messages/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/admin/messages/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/messages/:uid","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/messages/:uid","type":0,"val":"messages","end":""},{"old":"/api/v1/admin/messages/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['admin.messages.show']['types'],
  },
  'admin.messages.cancel': {
    methods: ["POST"],
    pattern: '/api/v1/admin/messages/:uid/cancel',
    tokens: [{"old":"/api/v1/admin/messages/:uid/cancel","type":0,"val":"api","end":""},{"old":"/api/v1/admin/messages/:uid/cancel","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/messages/:uid/cancel","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/messages/:uid/cancel","type":0,"val":"messages","end":""},{"old":"/api/v1/admin/messages/:uid/cancel","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/messages/:uid/cancel","type":0,"val":"cancel","end":""}],
    types: placeholder as Registry['admin.messages.cancel']['types'],
  },
  'admin.audit.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/audit',
    tokens: [{"old":"/api/v1/admin/audit","type":0,"val":"api","end":""},{"old":"/api/v1/admin/audit","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/audit","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/audit","type":0,"val":"audit","end":""}],
    types: placeholder as Registry['admin.audit.index']['types'],
  },
  'admin.jobs.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/jobs',
    tokens: [{"old":"/api/v1/admin/jobs","type":0,"val":"api","end":""},{"old":"/api/v1/admin/jobs","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/jobs","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/jobs","type":0,"val":"jobs","end":""}],
    types: placeholder as Registry['admin.jobs.index']['types'],
  },
  'admin.jobs.retry': {
    methods: ["POST"],
    pattern: '/api/v1/admin/jobs/:id/retry',
    tokens: [{"old":"/api/v1/admin/jobs/:id/retry","type":0,"val":"api","end":""},{"old":"/api/v1/admin/jobs/:id/retry","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/jobs/:id/retry","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/jobs/:id/retry","type":0,"val":"jobs","end":""},{"old":"/api/v1/admin/jobs/:id/retry","type":1,"val":"id","end":""},{"old":"/api/v1/admin/jobs/:id/retry","type":0,"val":"retry","end":""}],
    types: placeholder as Registry['admin.jobs.retry']['types'],
  },
  'admin.jobs.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/admin/jobs/:id',
    tokens: [{"old":"/api/v1/admin/jobs/:id","type":0,"val":"api","end":""},{"old":"/api/v1/admin/jobs/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/jobs/:id","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/jobs/:id","type":0,"val":"jobs","end":""},{"old":"/api/v1/admin/jobs/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['admin.jobs.destroy']['types'],
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
  'admin.gateways.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/admin/gateways/:uid',
    tokens: [{"old":"/api/v1/admin/gateways/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/admin/gateways/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/gateways/:uid","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/gateways/:uid","type":0,"val":"gateways","end":""},{"old":"/api/v1/admin/gateways/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['admin.gateways.update']['types'],
  },
  'admin.gateways.approve': {
    methods: ["POST"],
    pattern: '/api/v1/admin/gateways/:uid/approve',
    tokens: [{"old":"/api/v1/admin/gateways/:uid/approve","type":0,"val":"api","end":""},{"old":"/api/v1/admin/gateways/:uid/approve","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/gateways/:uid/approve","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/gateways/:uid/approve","type":0,"val":"gateways","end":""},{"old":"/api/v1/admin/gateways/:uid/approve","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/gateways/:uid/approve","type":0,"val":"approve","end":""}],
    types: placeholder as Registry['admin.gateways.approve']['types'],
  },
  'admin.gateways.claimCode': {
    methods: ["POST"],
    pattern: '/api/v1/admin/gateways/:uid/claim-code',
    tokens: [{"old":"/api/v1/admin/gateways/:uid/claim-code","type":0,"val":"api","end":""},{"old":"/api/v1/admin/gateways/:uid/claim-code","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/gateways/:uid/claim-code","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/gateways/:uid/claim-code","type":0,"val":"gateways","end":""},{"old":"/api/v1/admin/gateways/:uid/claim-code","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/gateways/:uid/claim-code","type":0,"val":"claim-code","end":""}],
    types: placeholder as Registry['admin.gateways.claimCode']['types'],
  },
  'admin.gateways.diagnostics': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/gateways/:uid/diagnostics',
    tokens: [{"old":"/api/v1/admin/gateways/:uid/diagnostics","type":0,"val":"api","end":""},{"old":"/api/v1/admin/gateways/:uid/diagnostics","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/gateways/:uid/diagnostics","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/gateways/:uid/diagnostics","type":0,"val":"gateways","end":""},{"old":"/api/v1/admin/gateways/:uid/diagnostics","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/gateways/:uid/diagnostics","type":0,"val":"diagnostics","end":""}],
    types: placeholder as Registry['admin.gateways.diagnostics']['types'],
  },
  'admin.gateways.enable': {
    methods: ["POST"],
    pattern: '/api/v1/admin/gateways/:uid/enable',
    tokens: [{"old":"/api/v1/admin/gateways/:uid/enable","type":0,"val":"api","end":""},{"old":"/api/v1/admin/gateways/:uid/enable","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/gateways/:uid/enable","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/gateways/:uid/enable","type":0,"val":"gateways","end":""},{"old":"/api/v1/admin/gateways/:uid/enable","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/gateways/:uid/enable","type":0,"val":"enable","end":""}],
    types: placeholder as Registry['admin.gateways.enable']['types'],
  },
  'admin.gateways.disable': {
    methods: ["POST"],
    pattern: '/api/v1/admin/gateways/:uid/disable',
    tokens: [{"old":"/api/v1/admin/gateways/:uid/disable","type":0,"val":"api","end":""},{"old":"/api/v1/admin/gateways/:uid/disable","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/gateways/:uid/disable","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/gateways/:uid/disable","type":0,"val":"gateways","end":""},{"old":"/api/v1/admin/gateways/:uid/disable","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/gateways/:uid/disable","type":0,"val":"disable","end":""}],
    types: placeholder as Registry['admin.gateways.disable']['types'],
  },
  'admin.operators.index': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/operators',
    tokens: [{"old":"/api/v1/admin/operators","type":0,"val":"api","end":""},{"old":"/api/v1/admin/operators","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/operators","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/operators","type":0,"val":"operators","end":""}],
    types: placeholder as Registry['admin.operators.index']['types'],
  },
  'admin.operators.store': {
    methods: ["POST"],
    pattern: '/api/v1/admin/operators',
    tokens: [{"old":"/api/v1/admin/operators","type":0,"val":"api","end":""},{"old":"/api/v1/admin/operators","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/operators","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/operators","type":0,"val":"operators","end":""}],
    types: placeholder as Registry['admin.operators.store']['types'],
  },
  'admin.operators.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/operators/:code',
    tokens: [{"old":"/api/v1/admin/operators/:code","type":0,"val":"api","end":""},{"old":"/api/v1/admin/operators/:code","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/operators/:code","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/operators/:code","type":0,"val":"operators","end":""},{"old":"/api/v1/admin/operators/:code","type":1,"val":"code","end":""}],
    types: placeholder as Registry['admin.operators.show']['types'],
  },
  'admin.operators.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/admin/operators/:code',
    tokens: [{"old":"/api/v1/admin/operators/:code","type":0,"val":"api","end":""},{"old":"/api/v1/admin/operators/:code","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/operators/:code","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/operators/:code","type":0,"val":"operators","end":""},{"old":"/api/v1/admin/operators/:code","type":1,"val":"code","end":""}],
    types: placeholder as Registry['admin.operators.update']['types'],
  },
  'admin.operators.ussd.upsert': {
    methods: ["PUT"],
    pattern: '/api/v1/admin/operators/:code/ussd',
    tokens: [{"old":"/api/v1/admin/operators/:code/ussd","type":0,"val":"api","end":""},{"old":"/api/v1/admin/operators/:code/ussd","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/operators/:code/ussd","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/operators/:code/ussd","type":0,"val":"operators","end":""},{"old":"/api/v1/admin/operators/:code/ussd","type":1,"val":"code","end":""},{"old":"/api/v1/admin/operators/:code/ussd","type":0,"val":"ussd","end":""}],
    types: placeholder as Registry['admin.operators.ussd.upsert']['types'],
  },
  'admin.operators.ussd.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/admin/operators/:code/ussd/:kind',
    tokens: [{"old":"/api/v1/admin/operators/:code/ussd/:kind","type":0,"val":"api","end":""},{"old":"/api/v1/admin/operators/:code/ussd/:kind","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/operators/:code/ussd/:kind","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/operators/:code/ussd/:kind","type":0,"val":"operators","end":""},{"old":"/api/v1/admin/operators/:code/ussd/:kind","type":1,"val":"code","end":""},{"old":"/api/v1/admin/operators/:code/ussd/:kind","type":0,"val":"ussd","end":""},{"old":"/api/v1/admin/operators/:code/ussd/:kind","type":1,"val":"kind","end":""}],
    types: placeholder as Registry['admin.operators.ussd.destroy']['types'],
  },
  'admin.sims.update': {
    methods: ["PATCH"],
    pattern: '/api/v1/admin/sims/:uid',
    tokens: [{"old":"/api/v1/admin/sims/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/admin/sims/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/sims/:uid","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/sims/:uid","type":0,"val":"sims","end":""},{"old":"/api/v1/admin/sims/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['admin.sims.update']['types'],
  },
  'admin.ussd.run': {
    methods: ["POST"],
    pattern: '/api/v1/admin/sims/:uid/ussd',
    tokens: [{"old":"/api/v1/admin/sims/:uid/ussd","type":0,"val":"api","end":""},{"old":"/api/v1/admin/sims/:uid/ussd","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/sims/:uid/ussd","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/sims/:uid/ussd","type":0,"val":"sims","end":""},{"old":"/api/v1/admin/sims/:uid/ussd","type":1,"val":"uid","end":""},{"old":"/api/v1/admin/sims/:uid/ussd","type":0,"val":"ussd","end":""}],
    types: placeholder as Registry['admin.ussd.run']['types'],
  },
  'admin.ussd.show': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/ussd/:uid',
    tokens: [{"old":"/api/v1/admin/ussd/:uid","type":0,"val":"api","end":""},{"old":"/api/v1/admin/ussd/:uid","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/ussd/:uid","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/ussd/:uid","type":0,"val":"ussd","end":""},{"old":"/api/v1/admin/ussd/:uid","type":1,"val":"uid","end":""}],
    types: placeholder as Registry['admin.ussd.show']['types'],
  },
  'root': {
    methods: ["GET","HEAD"],
    pattern: '/',
    tokens: [{"old":"/","type":0,"val":"/","end":""}],
    types: placeholder as Registry['root']['types'],
  },
  'health.live': {
    methods: ["GET","HEAD"],
    pattern: '/health',
    tokens: [{"old":"/health","type":0,"val":"health","end":""}],
    types: placeholder as Registry['health.live']['types'],
  },
  'health.ready': {
    methods: ["GET","HEAD"],
    pattern: '/health/ready',
    tokens: [{"old":"/health/ready","type":0,"val":"health","end":""},{"old":"/health/ready","type":0,"val":"ready","end":""}],
    types: placeholder as Registry['health.ready']['types'],
  },
  'health.metrics': {
    methods: ["GET","HEAD"],
    pattern: '/metrics',
    tokens: [{"old":"/metrics","type":0,"val":"metrics","end":""}],
    types: placeholder as Registry['health.metrics']['types'],
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
