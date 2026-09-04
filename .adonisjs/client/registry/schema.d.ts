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
}
