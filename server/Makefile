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
# sorted name, and the first also runs the other packages beside them. Only
# a SHARD given on the command line counts: one exported by a shell or a CI
# tool would quietly run half the tests.
SHARD_INDEX = $(word 1,$(subst /, ,$(SHARD)))
SHARD_COUNT = $(word 2,$(subst /, ,$(SHARD)))

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
	others=; status=0; \
	if [ "$(SHARD_INDEX)" -eq 1 ]; then \
		go test $$(go list ./... | grep -Ev '/($(RACE_PATH_PATTERN)|internal/product)$$') & others=$$!; \
	fi; \
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
