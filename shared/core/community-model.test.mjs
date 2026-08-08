import assert from 'node:assert/strict';

await import('./community-model.js');
const model = globalThis.RideTrackerCommunityModel;
assert.ok(model, 'Community model must be exported');

const values = new Map();
const storage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, value),
};
const store = model.createStore(storage, { idFactory:() => 'profile-test' });

assert.equal(store.load().profile.id, 'profile-test');
assert.equal(store.load().profile.defaultVisibility, 'private');

store.updateProfile({ pseudonym:'Coaster Fan', defaultVisibility:'friends', endpointPrivacyMeters:400 });
const ride = store.upsertRide({ id:'ride-1', title:'Testfahrt', parkName:'Testpark', rideName:'Testbahn' });
assert.equal(ride.visibility, 'friends');
assert.equal(ride.endpointPrivacyMeters, 400);

const publicRide = store.setVisibility('ride-1', 'public');
assert.equal(publicRide.publicationState, 'ready-for-backend');
const projection = store.publicProjection('ride-1');
assert.equal(projection.author.pseudonym, 'Coaster Fan');
assert.equal(projection.trackPrivacy, 'endpoints-redacted-400m');
assert.equal('latitude' in projection, false);
assert.equal('longitude' in projection, false);

const summary = store.summary();
assert.deepEqual(summary, { total:1, draft:0, private:0, friends:0, public:1, readyForBackend:1 });

assert.equal(store.removeRide('ride-1'), true);
assert.equal(store.summary().total, 0);
console.log('Community model tests passed.');
