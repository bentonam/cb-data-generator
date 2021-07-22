.DEFAULT_GOAL:= build
MAKEFLAGS = -j1
PATH := ./node_modules/.bin:$(PATH)
SHELL := /bin/bash
args = $(filter-out $@, $(MAKECMDGOALS))
.PHONY: all install clean deep-clean reinstall setup build compile build-source-maps compile-source-maps docs docs-server docs-build docs-compile watch lint test coverage test-coverage code-coverage report-coverage report-code-coverage ci prepatch patch minor major publish release

all:
	make build
	make test
	make lint

install:
	npm install

# remove the build and log folders
clean:
	rm -rf dist logs

# remove all files that are ignored by git
deep-clean:
	make clean
	rm -rf node_modules/ dist/ .nyc_output/ npm-debug.log yarn-error.log package-lock.json yarn.lock

# reinstall the node_modules and start with a fresh node build
reinstall setup:
	make deep-clean
	make install

# build the source files
build compile:
	make clean
	./node_modules/.bin/babel app --out-dir dist $(args)

# makes it easier to build files with source maps without errors
# from other make commands
build-source-maps compile-source-maps:
	make clean
	./node_modules/.bin/babel app --out-dir dist --source-maps $(args)

# start the server for the documentation
docs docs-server:
	docs server

# compile the documentation
docs-build docs-compile:
	docs compile docs-public

# When watching for changes we can assume it's a development env
# so build files with source maps
watch:
	make build-source-maps -- --watch $(args)

# lint test files
lint:
	command -v ./node_modules/.bin/eslint >/dev/null 2>&1 && ./node_modules/.bin/eslint 'app' 'test' || ./node_modules/lint-rules/node_modules/.bin/eslint 'app' 'test';

# run unit tests
test:
	./node_modules/.bin/ava $(args)

# run coverage for the tests
coverage test-coverage code-coverage:
	# if there's no instance source maps files then build the files with source maps
	@[ -f ./dist/index.js.map ] || (echo "building files with source maps" && make build-source-maps)
	NODE_ENV="test" ./node_modules/.bin/nyc ./node_modules/.bin/ava --verbose --no-cache


# These commands only run the report of the code coverage
report-coverage report-code-coverage:
	@if [ -d ./.nyc_output ]; then \
	 	NODE_ENV="test" ./node_modules/.bin/nyc report; \
	else \
		make test-coverage report-coverage; \
	fi

# posts code coverage to coveralls
post-coverage:
	@if [ -d ./.nyc_output ]; then \
		./node_modules/.bin/nyc report --reporter=text-lcov | coveralls; \
	else \
		make test-coverage post-coverage; \
	fi

# The command the ci server runs
ci:
	make lint || exit 1
	# if the tests fail then it will exit with an error
	make coverage || exit 1
	# show the coverage report
	./node_modules/.bin/nyc report
	# check check-coverage and if it fails then exit
	./node_modules/.bin/nyc check-coverage --statements 95 --functions 95 --lines 95 || exit 1

publish release:
	make reinstall
	make ci || exit 1
	# rebuild project without sourcemaps
	make build
	np --no-cleanup --yolo $(args)
