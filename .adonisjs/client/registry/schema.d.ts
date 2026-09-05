/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'client.token.store': {
    methods: ["POST"]
    pattern: '/api/v1/auth/token'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth').clientTokenValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth').clientTokenValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/client_tokens_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/client_tokens_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'sms.store': {
    methods: ["POST"]
    pattern: '/api/v1/sms'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/sms').sendSmsValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/sms').sendSmsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sms/sms_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sms/sms_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'sms.batch': {
    methods: ["POST"]
    pattern: '/api/v1/sms/batch'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/sms').sendSmsBatchValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/sms').sendSmsBatchValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sms/sms_controller').default['storeBatch']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sms/sms_controller').default['storeBatch']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'sms.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/sms'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/sms').listSmsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sms/sms_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sms/sms_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'sms.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/sms/:uid'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sms/sms_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sms/sms_controller').default['show']>>>
    }
  }
  'sms.cancel': {
    methods: ["POST"]
    pattern: '/api/v1/sms/:uid/cancel'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/sms/sms_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/sms/sms_controller').default['cancel']>>>
    }
  }
  'reports.daily': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/reports/daily'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/reports/reports_controller').default['daily']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/reports/reports_controller').default['daily']>>>
    }
  }
  'reports.summary': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/reports/summary'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/reports/reports_controller').default['summary']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/reports/reports_controller').default['summary']>>>
    }
  }
  'balances.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/balances'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/balances_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/balances_controller').default['index']>>>
    }
  }
  'webhooks.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/webhooks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhooks/webhook_endpoints_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/webhooks/webhook_endpoints_controller').default['index']>>>
    }
  }
  'webhooks.store': {
    methods: ["POST"]
    pattern: '/api/v1/webhooks'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/webhook').createWebhookEndpointValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/webhook').createWebhookEndpointValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhooks/webhook_endpoints_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/webhooks/webhook_endpoints_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'webhooks.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/webhooks/:uid'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhooks/webhook_endpoints_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/webhooks/webhook_endpoints_controller').default['show']>>>
    }
  }
  'webhooks.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/webhooks/:uid'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/webhook').updateWebhookEndpointValidator)>>
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/webhook').updateWebhookEndpointValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhooks/webhook_endpoints_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/webhooks/webhook_endpoints_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'webhooks.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/webhooks/:uid'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhooks/webhook_endpoints_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/webhooks/webhook_endpoints_controller').default['destroy']>>>
    }
  }
  'client.token.destroy': {
    methods: ["POST"]
    pattern: '/api/v1/auth/token/revoke'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/client_tokens_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/client_tokens_controller').default['destroy']>>>
    }
  }
  'gateway.register': {
    methods: ["POST"]
    pattern: '/api/v1/gw/register'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/gateway').registerGatewayValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/gateway').registerGatewayValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways/gateway_registration_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways/gateway_registration_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gateway.claim': {
    methods: ["POST"]
    pattern: '/api/v1/gw/claim'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/gateway').claimGatewayValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/gateway').claimGatewayValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways/gateway_registration_controller').default['claim']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways/gateway_registration_controller').default['claim']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gateway.provision': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/gw/provision'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways/gateway_provision_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways/gateway_provision_controller').default['show']>>>
    }
  }
  'gateway.sims.sync': {
    methods: ["POST"]
    pattern: '/api/v1/gw/sim-profiles'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/gateway').syncSimProfilesValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/gateway').syncSimProfilesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways/gateway_provision_controller').default['syncSims']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways/gateway_provision_controller').default['syncSims']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'gateway.results': {
    methods: ["POST"]
    pattern: '/api/v1/gw/results'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/gateway').reportResultsValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/gateway').reportResultsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/gateways/gateway_provision_controller').default['reportResults']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/gateways/gateway_provision_controller').default['reportResults']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.new_account.store': {
    methods: ["POST"]
    pattern: '/api/v1/auth/signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').signupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').signupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.access_tokens.store': {
    methods: ["POST"]
    pattern: '/api/v1/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/user').loginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/user').loginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'profile.profile.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/account/profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/profile_controller').default['show']>>>
    }
  }
  'profile.access_tokens.destroy': {
    methods: ["POST"]
    pattern: '/api/v1/account/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/access_tokens_controller').default['destroy']>>>
    }
  }
  'admin.overview': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/overview'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/overview_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/overview_controller').default['show']>>>
    }
  }
  'admin.tenants.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/tenants'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['index']>>>
    }
  }
  'admin.tenants.store': {
    methods: ["POST"]
    pattern: '/api/v1/admin/tenants'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin').createTenantValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/admin').createTenantValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.tenants.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/tenants/:uid'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['show']>>>
    }
  }
  'admin.tenants.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/tenants/:uid'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin').updateTenantValidator)>>
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin').updateTenantValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.clients.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/tenants/:uid/clients'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['indexClients']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['indexClients']>>>
    }
  }
  'admin.clients.store': {
    methods: ["POST"]
    pattern: '/api/v1/admin/tenants/:uid/clients'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin').createApiClientValidator)>>
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin').createApiClientValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['storeClient']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['storeClient']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.clients.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/tenants/:uid/clients/:clientUid'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin').updateApiClientValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { uid: ParamValue; clientUid: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin').updateApiClientValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['updateClient']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['updateClient']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.webhooks.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/tenants/:uid/webhooks'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['indexWebhooks']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/tenants_controller').default['indexWebhooks']>>>
    }
  }
  'admin.reports.daily': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/reports/daily'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/reports_controller').default['daily']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/reports_controller').default['daily']>>>
    }
  }
  'admin.staff.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/staff'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/staff_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/staff_controller').default['index']>>>
    }
  }
  'admin.staff.store': {
    methods: ["POST"]
    pattern: '/api/v1/admin/staff'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin').createStaffValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/admin').createStaffValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/staff_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/staff_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.staff.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/staff/:uid'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin').updateStaffValidator)>>
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin').updateStaffValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/staff_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/staff_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.messages.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/messages'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/admin').searchMessagesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/explorer_controller').default['messages']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/explorer_controller').default['messages']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.messages.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/messages/:uid'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/explorer_controller').default['message']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/explorer_controller').default['message']>>>
    }
  }
  'admin.messages.cancel': {
    methods: ["POST"]
    pattern: '/api/v1/admin/messages/:uid/cancel'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/explorer_controller').default['cancelMessage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/explorer_controller').default['cancelMessage']>>>
    }
  }
  'admin.audit.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/audit'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/admin').searchAuditValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/explorer_controller').default['audit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/explorer_controller').default['audit']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.jobs.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/jobs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/admin').listJobsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/jobs_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/jobs_controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.jobs.retry': {
    methods: ["POST"]
    pattern: '/api/v1/admin/jobs/:id/retry'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/jobs_controller').default['retry']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/jobs_controller').default['retry']>>>
    }
  }
  'admin.jobs.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/admin/jobs/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/jobs_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/jobs_controller').default['destroy']>>>
    }
  }
  'admin.gateways.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/gateways'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['index']>>>
    }
  }
  'admin.gateways.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/gateways/:uid'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['show']>>>
    }
  }
  'admin.gateways.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/gateways/:uid'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin').updateGatewayValidator)>>
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin').updateGatewayValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.gateways.approve': {
    methods: ["POST"]
    pattern: '/api/v1/admin/gateways/:uid/approve'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['approve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['approve']>>>
    }
  }
  'admin.gateways.claimCode': {
    methods: ["POST"]
    pattern: '/api/v1/admin/gateways/:uid/claim-code'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['issueClaimCode']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['issueClaimCode']>>>
    }
  }
  'admin.gateways.diagnostics': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/gateways/:uid/diagnostics'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/fleet_controller').default['diagnostics']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/fleet_controller').default['diagnostics']>>>
    }
  }
  'admin.gateways.enable': {
    methods: ["POST"]
    pattern: '/api/v1/admin/gateways/:uid/enable'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['enable']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['enable']>>>
    }
  }
  'admin.gateways.disable': {
    methods: ["POST"]
    pattern: '/api/v1/admin/gateways/:uid/disable'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['disable']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/gateways_controller').default['disable']>>>
    }
  }
  'admin.operators.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/operators'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['index']>>>
    }
  }
  'admin.operators.store': {
    methods: ["POST"]
    pattern: '/api/v1/admin/operators'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/operator').createOperatorValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/operator').createOperatorValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.operators.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/operators/:code'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { code: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['show']>>>
    }
  }
  'admin.operators.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/operators/:code'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/operator').updateOperatorValidator)>>
      paramsTuple: [ParamValue]
      params: { code: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/operator').updateOperatorValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.operators.ussd.upsert': {
    methods: ["PUT"]
    pattern: '/api/v1/admin/operators/:code/ussd'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/operator').upsertUssdCommandValidator)>>
      paramsTuple: [ParamValue]
      params: { code: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/operator').upsertUssdCommandValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['upsertUssdCommand']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['upsertUssdCommand']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.operators.ussd.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/admin/operators/:code/ussd/:kind'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { code: ParamValue; kind: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['destroyUssdCommand']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['destroyUssdCommand']>>>
    }
  }
  'admin.sims.update': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/sims/:uid'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin').updateSimValidator)>>
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin').updateSimValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/fleet_controller').default['updateSim']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/fleet_controller').default['updateSim']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.ussd.run': {
    methods: ["POST"]
    pattern: '/api/v1/admin/sims/:uid/ussd'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/operator').runUssdValidator)>>
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/operator').runUssdValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['runUssd']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['runUssd']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'admin.ussd.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/ussd/:uid'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { uid: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['showUssd']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/operators_controller').default['showUssd']>>>
    }
  }
  'root': {
    methods: ["GET","HEAD"]
    pattern: '/'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_controller').default['live']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/health_controller').default['live']>>>
    }
  }
  'health.live': {
    methods: ["GET","HEAD"]
    pattern: '/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_controller').default['live']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/health_controller').default['live']>>>
    }
  }
  'health.ready': {
    methods: ["GET","HEAD"]
    pattern: '/health/ready'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_controller').default['ready']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/health_controller').default['ready']>>>
    }
  }
  'health.metrics': {
    methods: ["GET","HEAD"]
    pattern: '/metrics'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/health_controller').default['metrics']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/health_controller').default['metrics']>>>
    }
  }
}
