# Debian e não Alpine: numpy, scikit-learn e (no futuro) PyTorch só têm wheels prontas pra glibc
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen
COPY *.py ./
COPY static ./static
# só o Caddy (via 127.0.0.1) alcança a porta, então dá pra confiar no X-Forwarded-For
CMD ["uv", "run", "--no-sync", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
