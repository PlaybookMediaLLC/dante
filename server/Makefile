.PHONY: generate fmt fmt-check test race vet check build

# The packages whose tests run under the race detector. This list is the one
# source of truth: CI runs `make race`, so a package added here is covered
# locally and in CI at the same time. It used to be duplicated in ci.yml, where
# it had grown to sixteen packages while this file still named seven — a data
# race in any of the other nine passed `make check` and failed in CI.
RACE_PACKAGES := \
	./internal/agentclients \
	./internal/authstore \
	./internal/enrichment \
	./internal/httpapi \
	./internal/maintenance \
	./internal/mcp \
	./internal/notifications \
	./internal/onboarding \
	./internal/publishing \
	./internal/shotsapi \
	./internal/social/tenantpublishing \
	./internal/socialapi \
	./internal/socialconnect \
	./internal/temporalmaintenance \
	./internal/temporalonboarding \
	./internal/temporalpublishing

# `go test ./...` would run every race package's tests a second time, without
# the detector, against the one shared test database. Exclude them by their
# import path suffix.
RACE_PATH_PATTERN := $(subst $(subst ,, ),|,$(patsubst ./%,%,$(RACE_PACKAGES)))

generate:
	go generate ./ent ./internal/social/ent ./internal/frontenddeploy/vercelapi

fmt:
	gofmt -w .

fmt-check:
	@test -z "$$(gofmt -l .)" || { gofmt -l .; exit 1; }

# CI splits `make test` into SHARD=1/2 and SHARD=2/2, one leg each; without
# SHARD it runs everything. internal/product runs its tests one at a time
# against one database and took 92 of the step's 100 s in CI, longer than
# every other package together, so each shard runs alternate product tests by
# sorted name and, beside them, alternate other packages: one shard running
# all the others took 88 s while its product half took 54. Only a SHARD given
# on the command line counts: one exported by a shell or a CI tool would
# quietly run half the tests.
SHARD_INDEX = $(word 1,$(subst /, ,$(SHARD)))
SHARD_COUNT = $(word 2,$(subst /, ,$(SHARD)))
# The slowest other packages in CI (54, 37 and 27 s) are dealt to the shards
# in turn ahead of the rest: alternating every package by name put all three
# on one shard, which took 83 s to the other's 49. A package missing from
# this list is still tested; it only sorts with the rest.
SLOW_TEST_PATTERN := internal/capture/browser|internal/social/database/integration|internal/social/helpers

test:
ifneq ($(origin SHARD),command line)
	go test $$(go list ./... | grep -Ev '/($(RACE_PATH_PATTERN))$$')
else
	@test "$(words $(subst /, ,$(SHARD)))" -eq 2 && test "$(SHARD_INDEX)" -ge 1 && \
		test "$(SHARD_INDEX)" -le "$(SHARD_COUNT)" || { echo "SHARD must be i/n with 1 <= i <= n" >&2; exit 1; }
	@set -e; \
	list="$$(go test -list . ./internal/product)"; \
	all="$$(printf '%s\n' "$$list" | grep -E '^(Test|Example|Fuzz)' | LC_ALL=C sort)"; \
	mine="$$(printf '%s\n' "$$all" | awk 'NR % $(SHARD_COUNT) == $(SHARD_INDEX) % $(SHARD_COUNT)')"; \
	test -n "$$mine" || { echo "internal/product: shard $(SHARD) has no tests" >&2; exit 1; }; \
	echo "internal/product: shard $(SHARD) runs $$(echo "$$mine" | wc -l) of $$(echo "$$all" | wc -l) tests"; \
	packages="$$(go list ./...)"; \
	packages="$$(printf '%s\n' "$$packages" | grep -Ev '/($(RACE_PATH_PATTERN)|internal/product)$$' | LC_ALL=C sort)"; \
	packages="$$( { printf '%s\n' "$$packages" | grep -E '/($(SLOW_TEST_PATTERN))$$'; \
		printf '%s\n' "$$packages" | grep -Ev '/($(SLOW_TEST_PATTERN))$$'; } | \
		awk 'NR % $(SHARD_COUNT) == $(SHARD_INDEX) % $(SHARD_COUNT)')"; \
	echo "shard $(SHARD) also runs $$(echo "$$packages" | grep -c .) other packages"; \
	others=; status=0; \
	if [ -n "$$packages" ]; then go test $$packages & others=$$!; fi; \
	go test -run "^($$(echo "$$mine" | paste -sd '|' -))$$" ./internal/product || status=$$?; \
	if [ -n "$$others" ]; then wait "$$others" || status=1; fi; \
	exit "$$status"
endif

race:
	go test -race $(RACE_PACKAGES)

vet:
	go vet ./...

check: generate fmt-check test race vet
	git diff --exit-code -- ent internal/social/ent internal/frontenddeploy/vercelapi/client.gen.go
	# `go generate` runs with -mod=mod, which may rewrite the module graph.
	# An unreviewed dependency change is a supply-chain change.
	git diff --exit-code -- go.mod go.sum

build:
	go build ./cmd/...

# Everything the `go-checks` CI job runs that does not need a database.
# Kept here so a contributor can reproduce the job with one command.
ci-check: fmt-check vet
