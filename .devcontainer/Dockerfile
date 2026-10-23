FROM node:24-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils python3-venv \
    && rm -rf /var/lib/apt/lists/*
COPY scripts/requirements-test.txt /tmp/requirements-test.txt
RUN python3 -m venv /opt/paperlight-tests \
    && /opt/paperlight-tests/bin/pip install --no-cache-dir -r /tmp/requirements-test.txt
ENV PATH="/opt/paperlight-tests/bin:${PATH}"
ENV PLAYWRIGHT_BROWSERS_PATH="/ms-playwright"
RUN npx --yes playwright@1.64.1 install --with-deps chromium firefox webkit \
    && chmod -R a+rX /ms-playwright
ENV PAPERLIGHT_PYTHON="/opt/paperlight-tests/bin/python"
ENV LANG="C.UTF-8" LC_ALL="C.UTF-8"
