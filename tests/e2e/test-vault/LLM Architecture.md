# LLM Architecture

Notes on large language model architecture and key developments I'm tracking.

## Transformer Fundamentals

The transformer (Vaswani et al., 2017) introduced **scaled dot-product attention**:

```
Attention(Q, K, V) = softmax(QK^T / √d_k) · V
```

Key components:
- **Self-attention** — each token attends to all others with learned weights
- **Multi-head attention** — h parallel attention heads, projected and concatenated
- **Positional encoding** — adds position signal (sinusoidal or learned RoPE)
- **Feed-forward sublayer** — 2-layer MLP applied position-wise

## KV Cache

Stores `key` and `value` tensors computed during prefill — avoids recomputation for each new token during autoregressive decoding.

| | Without KV cache | With KV cache |
|---|---|---|
| **Attention cost** | `O(n²)` per new token | `O(n)` per new token |
| **Memory** | None | Grows linearly with context |

At 128 k context with FP16, a single Llama-3 70B layer's KV cache ≈ 3.5 GB.

Related: [[Flash Attention]], [[Speculative Decoding]]

## Key Architectural Variants

| Model Family | Architecture | Key Innovation |
|---|---|---|
| GPT series | Decoder-only | Autoregressive, RLHF alignment |
| BERT / RoBERTa | Encoder-only | Bidirectional context, MLM pre-training |
| T5 / FLAN | Encoder-decoder | Text-to-text unified framework |
| Mamba | SSM-based | Linear-time attention, no quadratic cost |
| Mixture of Experts | Sparse activation | Scale without proportional compute |

## Inference Optimisations

- **Quantisation** — INT4/INT8 reduces VRAM 4–8×; minimal quality loss at 8-bit (GPTQ, AWQ)
- **Speculative decoding** — small draft model + large verifier; 2–3× throughput gain
- **Flash Attention v2** — IO-aware exact attention; 2–4× faster than standard; avoids materialising full NxN matrix
- **Continuous batching** — serve variable-length sequences without padding waste
- **PagedAttention** (vLLM) — OS-inspired virtual memory for KV cache; near-zero fragmentation

## Emerging Patterns (2025–2026)

- **MCP** (Model Context Protocol) — standardised tool + resource integration layer
- **Long-context models** (1M+ tokens) — Gemini 1.5, Claude 3.5 — enable full-repo RAG
- **Reasoning models** — chain-of-thought baked into training (o1, DeepSeek-R1)
- **Multi-modal** — unified vision + language encoders; audio next

## RAG vs Fine-tuning

| | RAG | Fine-tuning |
|---|---|---|
| **Freshness** | Dynamic, up-to-date | Snapshot at training time |
| **Cost** | Inference-time retrieval | Expensive training run |
| **Hallucination** | Grounded in sources | Prone without grounding |
| **Best for** | Knowledge-intensive tasks | Style / format changes |

## Tags

#llm #ai #architecture #transformers #kv-cache #rag #research
