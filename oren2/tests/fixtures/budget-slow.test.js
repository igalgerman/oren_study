// #187 fixture for tests/budget.test.sh: a suite that passes but takes ~3 s (never in the real SUITES list).
setTimeout(() => console.log('PASS slow\nRESULT budget-slow 1 0'), 3000);
