// The MIT License (MIT)
//
// Copyright (c) 2017 Firebase
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import { makeCloudFunction, CloudFunction, Event } from '../cloud-functions';
import * as _ from 'lodash';

/** @internal */
export const provider = 'google.firebase.analytics';

/** Handle events sent to Firebase Analytics. */
export function event(analyticsEventType: string) {
  return new AnalyticsEventBuilder(
    'projects/' + process.env.GCLOUD_PROJECT + '/events/' + analyticsEventType);
}

/** Builder used to create Cloud Functions that trigger from Firebase Analytics events. */
export class AnalyticsEventBuilder {
  /** @internal */
  constructor(private resource: string) { }

  /** Respond to the user logging an Analytics event. */
  onLog(
    handler: (event: Event<AnalyticsEvent>) => PromiseLike<any> | any
  ): CloudFunction<AnalyticsEvent> {
    const dataConstructor = (raw: Event<any>) => {
      return new AnalyticsEvent(raw.data);
    };
    return makeCloudFunction({
      provider, handler,
      eventType: 'event.log',
      resource: this.resource,
      dataConstructor,
    });
  }
}

/** A collection of information about a Firebase Analytics event that was logged for a specific user. */
export class AnalyticsEvent {
  /** The date on which the event.was logged.
   *  (YYYYMMDD format in the registered timezone of your app.)
   */
  reportingDate: string;

  /** The name of the event. */
  name: string;

  /** A repeated record of the parameters associated with the event.
   *  Note: this value is cast to its most appropriate type, which due to the nature of JavaScript's number
   *  handling might entail a loss of precision in case of very large integers.
   */
  params: { [key: string]: any };

  /** UTC client time when the event happened. */
  logTime: string;

  /** UTC client time when the previous event happened. */
  previousLogTime?: string;

  /** Value param in USD. */
  valueInUSD?: number;

  /** User related dimensions. */
  user?: UserDimensions;

  /** @internal */
  constructor(wireFormat: any) {
    this.params = {};  // In case of absent field, show empty (not absent) map.
    if (wireFormat.eventDim && wireFormat.eventDim.length > 0) {
      // If there's an eventDim, there'll always be exactly one.
      let eventDim = wireFormat.eventDim[0];
      copyField(eventDim, this, 'name');
      copyField(eventDim, this, 'params', p => _.mapValues(p, unwrapValue));
      copyFieldTo(eventDim, this, 'valueInUsd', 'valueInUSD');
      copyFieldTo(eventDim, this, 'date', 'reportingDate');
      copyTimestampToString(eventDim, this, 'timestampMicros', 'logTime');
      copyTimestampToString(eventDim, this, 'previousTimestampMicros', 'previousLogTime');
    }
    copyFieldTo(wireFormat, this, 'userDim', 'user', dim => new UserDimensions(dim));
  }
}

/** A collection of information about the user who triggered these events. */
export class UserDimensions {
  /* tslint:disable:max-line-length */
  /** The user ID set via the setUserId API.
   *  https://firebase.google.com/docs/reference/android/com/google/firebase/analytics/FirebaseAnalytics.html#setUserId(java.lang.String)
   *  https://firebase.google.com/docs/reference/ios/firebaseanalytics/api/reference/Classes/FIRAnalytics#/c:objc(cs)FIRAnalytics(cm)setUserID
   */
  userId?: string;
  /* tslint:enable:max-line-length */

  /** The time (in UTC) at which the user first opened the app. */
  firstOpenTime?: string;

  /** A repeated record of user properties set with the setUserProperty API.
   *  https://firebase.google.com/docs/analytics/android/properties
   */
  userProperties: { [key: string]: UserPropertyValue };

  /** Device information. */
  deviceInfo: DeviceInfo;

  /** User's geographic information. */
  geoInfo: GeoInfo;

  /** App information. */
  appInfo?: AppInfo;

  /** Information about the marketing campaign which acquired the user. */
  trafficSource?: TrafficSource;

  /** Information regarding the bundle in which these events were uploaded. */
  bundleInfo: ExportBundleInfo;

  /** Lifetime Value revenue of this user, in USD. */
  ltvInUSD?: number;

  /** @internal */
  constructor(wireFormat: any) {
    // These are interfaces or primitives, no transformation needed.
    copyFields(wireFormat, this, ['userId', 'deviceInfo', 'geoInfo', 'appInfo', 'trafficSource']);

    // The following fields do need transformations of some sort.
    copyTimestampToString(wireFormat, this, 'firstOpenTimestampMicros', 'firstOpenTime');
    this.userProperties = {};  // With no entries in the wire format, present an empty (as opposed to absent) map.
    copyField(wireFormat, this, 'userProperties', r => _.mapValues(r, p => new UserPropertyValue(p)));
    copyField(wireFormat, this, 'bundleInfo', r => new ExportBundleInfo(r));
    if (wireFormat.ltvInfo && wireFormat.ltvInfo.currency === 'USD') {
      this.ltvInUSD = wireFormat.ltvInfo.revenue;
    }
  }
}

/** Predefined (eg: LTV) or custom properties (eg: birthday) stored on client side and associated with
 *  subsequent HitBundles.
 */
export class UserPropertyValue {
  /** Last set value of user property. */
  value: string;

  /** UTC client time when user property was last set. */
  setTime: string;

  /** @internal */
  constructor(wireFormat: any) {
    copyField(wireFormat, this, 'value', unwrapValueAsString);
    copyTimestampToString(wireFormat, this, 'setTimestampUsec', 'setTime');
  }
}

/** A collection of information about the device that triggered these events. */
export interface DeviceInfo {
  /** Device category. Eg. 'tablet' or 'mobile'. */
  deviceCategory?: string;

  /** Device brand name. Eg. 'Samsung', 'HTC', etc. */
  mobileBrandName?: string;

  /** Device model name. Eg. 'GT-I9192'. */
  mobileModelName?: string;

  /** Device marketing name. Eg. 'Galaxy S4 Mini'. */
  mobileMarketingName?: string;

  /** Device model. Eg. 'GT-I9192' */
  deviceModel?: string;

  /** Device OS version when data capture ended. Eg. '4.4.2'. */
  platformVersion?: string;

  /** Vendor specific device identifier. This is IDFV on iOS. Not used for Android.
   *  Example: '599F9C00-92DC-4B5C-9464-7971F01F8370'
   */
  deviceId?: string;

  /** The type of the resettable_device_id is IDFA on iOS (when available) and AdId on Android.
   *  Example: '71683BF9-FA3B-4B0D-9535-A1F05188BAF3'
   */
  resettableDeviceId?: string;

  /** The user language in language-country format, where language is an ISO 639 value and country is
   *  a ISO 3166 value. Eg. 'en-us', 'en-za', 'zh-tw', 'jp'.
   */
  userDefaultLanguage: string;

  /** The timezone of the device when data was uploaded as seconds skew from UTC.
   *  Use this to calculate the device's local time for event.data.timestamp.
   */
  deviceTimeZoneOffsetSeconds: number;

  /** The device's Limit Ad Tracking setting.
   *  When true, you cannot use resettableDeviceId for remarketing, demographics or influencing ads serving behaviour.
   *  However, you can use resettableDeviceId for conversion tracking and campaign attribution.
   */
  limitedAdTracking: boolean;
}

/** A collection of information about the geographic origin of these events. */
export interface GeoInfo {
  /** The geographic continent. Eg. 'Americas'. */
  continent?: string;

  /** The geographic country. Eg. 'Brazil'. */
  country?: string;

  /** The geographic region. Eg. 'State of Sao Paulo'. */
  region?: string;

  /** The geographic city. Eg. 'Sao Paulo'. */
  city?: string;
}

/** A collection of information about the application that triggered these events. */
export interface AppInfo {
  /** The app's version name.
   *  Examples: '1.0', '4.3.1.1.213361', '2.3 (1824253)', 'v1.8b22p6'.
   */
  appVersion?: string;

  /** Unique id for this instance of the app.
   *  Example: '71683BF9FA3B4B0D9535A1F05188BAF3'.
   */
  appInstanceId: string;

  /** The identifier of the store that installed the app.
   *  Eg. 'com.sec.android.app.samsungapps', 'com.amazon.venezia', 'com.nokia.nstore'.
   */
  appStore?: string;

  /** The app platform. Eg. 'ANDROID', 'IOS'. */
  appPlatform: string;

  /** Unique application identifier within an app store. */
  appId?: string;
}

/** Information about the marketing campaign which acquired the user that triggered these events. */
export interface TrafficSource {
  /** The name of the network which acquired the user. Eg. "Google". */
  userAcquiredSource?: string;

  /** The name of the medium which acquired the user. Eg. "Banner". */
  userAcquiredMedium?: string;

  /** The name of the campaign which acquired the user. Eg. "Winter Promo". */
  userAcquiredCampaign?: string;
}

/** Information regarding the bundle in which these events were uploaded. */
export class ExportBundleInfo {
  /**  Monotonically increasing index for each bundle set by the Analytics SDK. */
  bundleSequenceId: number;

  /** Timestamp offset (in milliseconds) between collection time and upload time. */
  serverTimestampOffset: number;

  /** @internal */
  constructor(wireFormat: any) {
    copyField(wireFormat, this, 'bundleSequenceId');
    copyTimestampToMillis(wireFormat, this, 'serverTimestampOffsetMicros', 'serverTimestampOffset');
  }
}

function copyFieldTo<T, K extends keyof T>(
  from: any, to: T, fromField: string, toField: K, transform = _.identity): void {
  if (from[fromField] !== undefined) {
    to[toField] = transform(from[fromField]);
  }
}

function copyField<T, K extends keyof T>(from: any, to: T, field: K, transform = _.identity): void {
  copyFieldTo(from, to, field, field, transform);
}

function copyFields<T, K extends keyof T>(from: any, to: T, fields: K[]): void {
  for (let field of fields) {
    copyField(from, to, field);
  }
}

// The incoming payload will have fields like:
// {
//   'myInt': {
//     'intValue': '123'
//   },
//   'myDouble': {
//     'doubleValue': 1.0
//   },
//   'myFloat': {
//     'floatValue': 1.1
//   },
//   'myString': {
//     'stringValue': 'hi!'
//   }
// }
//
// The following method will remove these four types of 'xValue' fields, flattening them
// to just their values, as a string:
// {
//   'myInt': '123',
//   'myDouble': '1.0',
//   'myFloat': '1.1',
//   'myString': 'hi!'
// }
//
// Note that while 'intValue' will have a quoted payload, 'doubleValue' and 'floatValue' will not. This
// is due to the encoding library, which renders int64 values as strings to avoid loss of precision. This
// method always returns a string, similarly to avoid loss of precision, unlike the less-conservative
// 'unwrapValue' method just below.
function unwrapValueAsString(wrapped: any): string {
  let key: string = _.keys(wrapped)[0];
  return _.toString(wrapped[key]);
}
// Ditto as the method above, but returning the values in the idiomatic JavaScript type (string for strings,
// number for numbers):
// {
//   'myInt': 123,
//   'myDouble': 1.0,
//   'myFloat': 1.1,
//   'myString': 'hi!'
// }
//
// The field names in the incoming xValue fields identify the type a value has, which for JavaScript's
// purposes can be divided into 'number' versus 'string'. This method will render all the numbers as
// JavaScript's 'number' type, since we prefer using idiomatic types. Note that this may lead to loss
// in precision for int64 fields, so use with care.
const xValueNumberFields = ['intValue', 'floatValue', 'doubleValue'];
function unwrapValue(wrapped: any): any {
  let key: string = _.keys(wrapped)[0];
  let value: string = unwrapValueAsString(wrapped);
  return _.includes(xValueNumberFields, key) ? _.toNumber(value) : value;
}

// The JSON payload delivers timestamp fields as strings of timestamps denoted in microseconds.
// The JavaScript convention is to use numbers denoted in milliseconds. This method
// makes it easy to convert a field of one type into the other.
function copyTimestampToMillis<T, K extends keyof T>(from: any, to: T, fromName: string, toName: K) {
  if (from[fromName] !== undefined) {
    to[toName] = <any>_.round(from[fromName] / 1000);
  }
}

// The JSON payload delivers timestamp fields as strings of timestamps denoted in microseconds.
// In our SDK, we'd like to present timestamp as ISO-format strings. This method makes it easy
// to convert a field of one type into the other.
function copyTimestampToString<T, K extends keyof T>(from: any, to: T, fromName: string, toName: K) {
  if (from[fromName] !== undefined) {
    to[toName] = <any>(new Date(from[fromName] / 1000)).toISOString();
  }
}