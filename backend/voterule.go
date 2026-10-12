package main

// The duplicate-vote rule lives here and nowhere else.
//
// Current rule (provisional, pending Edwin's decision): one vote per question
// per anonymous device. VoterID is a random id the browser generates once and
// keeps in local storage. It carries no personal data. When accounts arrive, a
// device's votes can be re-keyed to the account by rewriting VoterID, and this
// function is the only place that needs to change if the rule itself changes
// (for example to an account id, or one vote per question per day).
func voteDedupeKey(v VoteRequest) string {
	return v.QuestionID + "\x00" + v.VoterID
}
