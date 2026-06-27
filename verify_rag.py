import os
import sys
from rag import RAGManager

def main():
    print("=== RAG/Knowledge Base Verification ===")
    
    # Initialize RAGManager
    try:
        manager = RAGManager()
        # Scan and rebuild index
        print("Scanning and indexing files in 'knowledge_base/' directory...")
        manager.scan_and_rebuild(dict(os.environ))
    except Exception as e:
        print(f"Error initializing or scanning knowledge base: {e}")
        sys.exit(1)
        
    # List files
    files = manager.list_files()
    print(f"\nFiles found in index: {len(files)}")
    for f in files:
        print(f" - {f['filename']} ({f['chunk_count']} chunks, size: {f['size']} bytes)")
        
    print(f"\nTotal indexed chunks: {len(manager.chunks)}")
    
    # Test query
    if not manager.chunks:
        print("\nWARNING: Your knowledge base is currently empty.")
        print("To test, place a text (.txt/.md) or PDF file in the 'knowledge_base' directory and run this script again.")
        return
        
    if len(sys.argv) > 1:
        test_word = " ".join(sys.argv[1:])
        print(f"\nRunning custom query for: '{test_word}'")
    else:
        # We will search for a term that might be in the index
        # We try to find a word from one of the chunks
        test_word = "preparation"
        for chunk in manager.chunks:
            words = chunk["text"].split()
            if words:
                test_word = words[0].strip(".,;:?!'\"()[]{}")
                if len(test_word) > 3:
                    break
        print(f"\nRunning automated test query for: '{test_word}'")
                
    results = manager.query(test_word, top_k=2)
    print(f"Query Results found: {len(results)}")
    for i, res in enumerate(results, 1):
        print(f"\n--- Result #{i} (Score: {res['score']:.4f}, Source: {res['filename']}) ---")
        # Print first 150 characters of chunk
        preview = res["text"][:150].replace("\n", " ")
        if len(res["text"]) > 150:
            preview += "..."
        print(preview)

if __name__ == "__main__":
    main()
