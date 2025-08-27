import random

def devine_le_nombre_auto():
    """Version automatique du jeu de devinette qui simule plusieurs parties"""
    print("🎮 Jeu de Devinette Automatique - Simulation de 5 parties")
    print("=" * 50)
    
    total_tentatives = 0
    parties_gagnees = 0
    
    for partie in range(1, 6):
        print(f"\n🎯 Partie {partie}:")
        nombre_secret = random.randint(1, 10)
        print(f"Nombre secret généré: {nombre_secret}")
        
        tentatives = 0
        trouve = False
        
        # Simulation de devinettes intelligentes
        min_val, max_val = 1, 10
        
        while not trouve and tentatives < 5:
            # Stratégie: essayer le milieu de l'intervalle
            devine = (min_val + max_val) // 2
            tentatives += 1
            
            print(f"  Tentative {tentatives}: {devine}", end="")
            
            if devine < nombre_secret:
                print(" → Trop petit!")
                min_val = devine + 1
            elif devine > nombre_secret:
                print(" → Trop grand!")
                max_val = devine - 1
            else:
                print(" → 🎉 Trouvé!")
                trouve = True
                parties_gagnees += 1
        
        if not trouve:
            print(f"  ❌ Échec après {tentatives} tentatives. Le nombre était {nombre_secret}")
        else:
            print(f"  ✅ Succès en {tentatives} tentatives!")
        
        total_tentatives += tentatives
    
    # Statistiques finales
    print("\n" + "=" * 50)
    print("📊 Statistiques de la simulation:")
    print(f"Parties jouées: 5")
    print(f"Parties gagnées: {parties_gagnees}")
    print(f"Taux de réussite: {(parties_gagnees/5)*100:.1f}%")
    print(f"Moyenne de tentatives: {total_tentatives/5:.1f}")
    print("\n🤖 Simulation terminée avec succès!")

def jeu_demo_simple():
    """Version encore plus simple pour démonstration rapide"""
    print("🎲 Démonstration rapide du jeu de devinette")
    
    nombre_secret = random.randint(1, 10)
    print(f"Nombre secret: {nombre_secret}")
    
    # Simulation de 3 tentatives
    tentatives = [random.randint(1, 10) for _ in range(3)]
    
    for i, tentative in enumerate(tentatives, 1):
        print(f"Tentative {i}: {tentative}", end="")
        if tentative == nombre_secret:
            print(" → 🎉 Gagné!")
            break
        elif tentative < nombre_secret:
            print(" → Plus grand")
        else:
            print(" → Plus petit")
    else:
        print(f"\nLe nombre était {nombre_secret}")

if __name__ == "__main__":
    # Lancer la simulation complète
    devine_le_nombre_auto()
    
    print("\n" + "-" * 30)
    
    # Démonstration simple
    jeu_demo_simple()