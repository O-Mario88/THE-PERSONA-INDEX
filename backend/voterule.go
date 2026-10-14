package main

// The duplicate-vote rule lives here and nowhere else.
//
// Current rule (default chosen 2026-10-14): one vote per question per device.
// A device is a server-signed token from POST /api/device (devicetoken.go),
// so the browser cannot invent new ones, and only a keyed hash of its id is
// stored. When accounts arrive, the rule becomes one vote per question per
// account, and this function is the only place that needs to change.
func voteDedupeKey(v Vote) string {
	return v.QuestionID + "|" + v.VoterHash // VoterHash is fixed-length hex, so this cannot collide
}
