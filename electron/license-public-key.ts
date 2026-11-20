// The public half of the key that signs licences. Replaced by "npm run license:init".
// IS_DEMO_KEY = true means this is the demo key from the repository: anyone could make licences
// for it, so "npm run build" refuses to package the app until a real key is made.
export const IS_DEMO_KEY = true;
export const LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAfcXZ/ujhPx54DZObqM3RIc4lqGpFYbDcDSUG+5Fx9uE=
-----END PUBLIC KEY-----`;
