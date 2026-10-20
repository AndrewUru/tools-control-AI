// Executed only inside the Android app, before the shared API routes.
function nativeCall(sql, params, mode) {
  const result = JSON.parse(Android.database(sql, JSON.stringify(params), mode));
  if (result.error) throw new Error(result.error);
  return result.value;
}
const db = {
  exec(sql) { return nativeCall(sql, [], 'exec'); },
  prepare(sql) {
    return {
      all(...params) { return nativeCall(sql, params, 'all'); },
      get(...params) { return nativeCall(sql, params, 'all')[0]; },
      run(...params) { return nativeCall(sql, params, 'run'); },
    };
  },
};
const crypto = { randomBytes(size) { return { toString() { return Android.randomHex(size); } }; } };
const hashPassword = password => Android.hashPassword(String(password));
const verificarPassword = (password, hash) => Android.verifyPassword(String(password), hash || '');
