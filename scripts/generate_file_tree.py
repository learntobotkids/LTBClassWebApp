import os

ROOT_NAME = "PROJECT INSTRUCTIONS"
INPUT_FILE = "project_instructions_raw.txt"
OUTPUT_FILE = "project_instructions_tree.md"

def generate_tree():
    try:
        with open(INPUT_FILE, 'r') as f:
            paths = [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        print(f"Error: {INPUT_FILE} not found")
        return
    
    # Sort paths to ensure directories come before files if possible, 
    # but strictly alphabetical sort handles hierarchy if processed sequentially?
    # Actually simple sort helps.
    paths.sort()
    
    tree = {}
    
    for path in paths:
        # Normalize and split
        parts = path.split('/')
        
        # Find index of ROOT_NAME
        try:
            root_idx = parts.index(ROOT_NAME)
            # We want headers from ROOT_NAME downwards
            # parts[root_idx] is "FINAL KIDS FILES"
            # We want that as root? Or content of it? 
            # User wants "files in each of the folders".
            # Let's keep FINAL KIDS FILES as the top level.
            rel_parts = parts[root_idx:] 
        except ValueError:
            continue
            
        current = tree
        for part in rel_parts:
            if part not in current:
                current[part] = {}
            current = current[part]

    # Function to print tree
    lines = []
    
    def print_node(node, level):
        # We process children. 
        # For the root (level 0), it's the dict containing "FINAL KIDS FILES" -> children
        
        # Actually my logic above: 
        # tree = { "FINAL KIDS FILES": { "Student": { "File": {} } } }
        
        for name in sorted(node.keys()):
            if level == 0:
                 lines.append(f"# {name}")
                 print_node(node[name], level + 1)
            else:
                 indent = "  " * (level - 1)
                 # Check if it has children (is likely a directory)
                 if node[name]:
                     lines.append(f"{indent}- **{name}/**")
                     print_node(node[name], level + 1)
                 else:
                     lines.append(f"{indent}- {name}")

    print_node(tree, 0)
    
    with open(OUTPUT_FILE, 'w') as f:
        f.write('\n'.join(lines))
    
    print(f"Tree generated in {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_tree()
