import numpy as np
import torch
from torch.utils.data import DataLoader, TensorDataset
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report
from sklearn.model_selection import train_test_split
from datasets import load_dataset
from transformers import BertTokenizer, BertForSequenceClassification

# ==========================================
# 1. Configuration (設定區)
# ==========================================
MODEL_NAME = 'bert-base-uncased'
MAX_LENGTH = 256
BATCH_SIZE = 16
NUM_EPOCHS = 3
LEARNING_RATE = 2e-5

# 這裡換上你在第一題找到表現最好的 Prompt，或者用原本的也行
# 例如我們用推薦的自然結尾 Prompt：
PROMPT = "This movie review clearly states that the sentiment is [MASK]. The text is: " 

# Set device
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# ==========================================
# 2. Load and Split Dataset (資料載入區)
# ==========================================
dataset = load_dataset('imdb')
# 這裡依照你的作業要求先取 1000 筆測試 (12000 到 12999)
full_texts = dataset['train']['text'][12000:13000]  
full_labels = dataset['train']['label'][12000:13000]

# Split dataset
train_texts, test_texts, train_labels, test_labels = train_test_split(
    full_texts, full_labels, test_size=0.2, random_state=42
)
train_texts, val_texts, train_labels, val_labels = train_test_split(
    train_texts, train_labels, test_size=0.25, random_state=42
)

# ==========================================
# 3. Initialize Tokenizer and Model (模型初始化)
# ==========================================
tokenizer = BertTokenizer.from_pretrained(MODEL_NAME)
model = BertForSequenceClassification.from_pretrained(
    MODEL_NAME,
    num_labels=2  # Binary classification
).to(device)

# 【重要修改】：這裡「不要」凍結 BERT 的參數！
# 也就是不要跑 param.requires_grad = False 的迴圈，這樣才能做到 Fine-tuning (方法 3 的精髓)

# ==========================================
# 4. Preprocess Function (資料前處理，結合方法 2)
# ==========================================
def preprocess(texts, labels):
    # 【重要修改】：把 Prompt 加到每一句文本的前面 (方法 2 的精髓)
    prompted_texts = [PROMPT + text for text in texts]
    
    encodings = tokenizer(
        prompted_texts,
        padding=True,
        truncation=True,
        max_length=MAX_LENGTH,
        return_tensors='pt'
    )
    return TensorDataset(
        encodings['input_ids'],
        encodings['attention_mask'],
        torch.tensor(labels)
    )

# Prepare datasets
train_dataset = preprocess(train_texts, train_labels)
train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)

# ==========================================
# 5. Training Loop (訓練迴圈)
# ==========================================
# 【重要修改】：Optimizer 必須傳入 model.parameters() 讓所有參數都能被訓練
optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE)

model.train()
print("Starting Fine-tuning with Hard Prompts...")
for epoch in range(NUM_EPOCHS):
    total_loss = 0
    for batch in train_loader:
        input_ids, attention_mask, labels = [t.to(device) for t in batch]

        optimizer.zero_grad()

        outputs = model(
            input_ids,
            attention_mask=attention_mask,
            labels=labels
        )

        loss = outputs.loss
        total_loss += loss.item()

        loss.backward()
        optimizer.step()

    avg_loss = total_loss / len(train_loader)
    print(f"Epoch {epoch+1} | Average Loss: {avg_loss:.4f}")

# ==========================================
# 6. Evaluation Function (驗證與評估)
# ==========================================
def evaluate(texts, labels):
    test_dataset = preprocess(texts, labels) # 這裡同樣會自動加上 Prompt
    test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE)

    model.eval()
    predictions = []
    true_labels = []

    with torch.no_grad():
        for batch in test_loader:
            input_ids, attention_mask, batch_labels = [t.to(device) for t in batch]

            outputs = model(input_ids, attention_mask=attention_mask)
            logits = outputs.logits

            batch_preds = torch.argmax(logits, dim=1).cpu().numpy()
            predictions.extend(batch_preds)
            true_labels.extend(batch_labels.cpu().numpy())

    return accuracy_score(true_labels, predictions)

# Evaluate on validation set
val_accuracy = evaluate(val_texts, val_labels)
print(f"Validation Accuracy: {val_accuracy:.4f}")

# ==========================================
# 7. Testing and Prediction (測試預測)
# ==========================================
def predict(text):
    # 預測時也要手動把 Prompt 加上去
    prompted_text = PROMPT + text
    encoding = tokenizer(
        prompted_text,
        padding='max_length',
        truncation=True,
        max_length=MAX_LENGTH,
        return_tensors='pt'
    ).to(device)

    with torch.no_grad():
        outputs = model(**encoding)

    return torch.argmax(outputs.logits).item()

print("\n--- Testing Results ---")
test_text_example = "This movie was absolutely fantastic! I loved every minute of it."
print(f"Prediction for example: {'Positive' if predict(test_text_example) else 'Negative'}")

y_pred = [predict(text) for text in test_texts]
print("\nClassification Report:")
print(classification_report(test_labels, y_pred, target_names=['Negative','Positive'], digits=4))
print("\nConfusion Matrix:")
print(confusion_matrix(test_labels, y_pred))